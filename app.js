// === КОНФИГУРАЦИЯ SUPABASE ===
const SUPABASE_URL = 'https://hrwoenkrfducxuduuvfr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zwmmH6vHObejL0S_z7MdSg_Vq303EH4';

// === СОСТОЯНИЕ ===
let state = {
    view: 'day',
    currentDate: new Date(),
    tasks: [],
    users: [
        { id: null, name: 'Лизик', color: '#D9ADD1' },
        { id: null, name: 'Дашик', color: '#E26728' },
        { id: null, name: 'Катик', color: '#CBCADC' }
    ],
    selectedUserIndex: 0,
    currentUser: null,
    isAuthenticated: false,
    userEmails: {}
};

let deleteTarget = null;
let syncTimeout = null;
let supabaseChannel = null;
let supabase = null;

// === DOM ===
const $ = id => document.getElementById(id);
const userSelector = $('userSelector');
const dateDisplay = $('dateDisplay');
const content = $('content');
const syncStatus = $('syncStatus');
const welcomeOverlay = $('welcomeOverlay');
const authOverlay = $('authOverlay');
const authError = $('authError');
const authSuccess = $('authSuccess');
const app = $('app');

// === ИНИЦИАЛИЗАЦИЯ SUPABASE ===
try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase инициализирован');
} catch (error) {
    console.error('❌ Ошибка инициализации Supabase:', error);
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function formatDateKey(date) {
    const d = new Date(date);
    return d.getFullYear() + '-' + 
           String(d.getMonth() + 1).padStart(2, '0') + '-' + 
           String(d.getDate()).padStart(2, '0');
}

function formatDateDisplay(date) {
    const d = new Date(date);
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function formatWeekRange(date) {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    if (start.getMonth() === end.getMonth()) {
        return start.getDate() + '–' + end.getDate() + ' ' + months[start.getMonth()];
    } else {
        return start.getDate() + ' ' + months[start.getMonth()] + ' – ' + 
               end.getDate() + ' ' + months[end.getMonth()];
    }
}

function getWeekDays(date) {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay() + 1);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        days.push(d);
    }
    return days;
}

function isToday(date) {
    const d = new Date(date);
    const t = new Date();
    return d.getFullYear() === t.getFullYear() &&
           d.getMonth() === t.getMonth() &&
           d.getDate() === t.getDate();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSyncStatus(message) {
    syncStatus.textContent = message;
    syncStatus.classList.add('show');
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        syncStatus.classList.remove('show');
    }, 1500);
}

// === АВТОРИЗАЦИЯ ===
async function checkAuth() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user && session) {
            state.currentUser = user;
            state.isAuthenticated = true;
            
            const email = user.email;
            if (email) {
                const index = state.userEmails[email];
                if (index !== undefined) {
                    state.selectedUserIndex = index;
                } else {
                    const newIndex = state.users.length;
                    const name = email.split('@')[0] || 'Пользователь';
                    const colors = ['#D9ADD1', '#E26728', '#CBCADC', '#A8D5BA', '#F7DC6F', '#85C1E9'];
                    state.users.push({
                        id: user.id,
                        name: name,
                        color: colors[newIndex % colors.length]
                    });
                    state.userEmails[email] = newIndex;
                    state.selectedUserIndex = newIndex;
                }
            }
            
            authOverlay.classList.remove('show');
            app.classList.add('show');
            
            subscribeToTasks();
            render();
            showSyncStatus('✅ Добро пожаловать, ' + (state.users[state.selectedUserIndex]?.name || '') + '!');
            return true;
        } else {
            state.currentUser = null;
            state.isAuthenticated = false;
            app.classList.remove('show');
            authOverlay.classList.add('show');
            return false;
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        return false;
    }
}

async function signIn(email, password) {
    authError.textContent = '';
    authSuccess.textContent = '';
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await checkAuth();
    } catch (error) {
        authError.textContent = '❌ ' + error.message;
        console.error('Ошибка входа:', error);
    }
}

async function signUp(email, password) {
    authError.textContent = '';
    authSuccess.textContent = '';
    try {
        const { data, error } = await supabase.auth.signUp({ 
            email, 
            password,
            options: {
                emailRedirectTo: window.location.origin
            }
        });
        if (error) throw error;
        
        if (data.user?.identities?.length === 0) {
            authError.textContent = '❌ Этот email уже зарегистрирован';
            return;
        }
        
        authSuccess.textContent = '✅ Проверьте почту для подтверждения!';
        setTimeout(() => {
            authSuccess.textContent = '';
        }, 5000);
    } catch (error) {
        authError.textContent = '❌ ' + error.message;
        console.error('Ошибка регистрации:', error);
    }
}

async function signOut() {
    try {
        if (supabaseChannel) {
            supabaseChannel.unsubscribe();
            supabaseChannel = null;
        }
        await supabase.auth.signOut();
        state.currentUser = null;
        state.isAuthenticated = false;
        state.tasks = [];
        app.classList.remove('show');
        authOverlay.classList.add('show');
        showSyncStatus('👋 До свидания!');
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
}

// === РАБОТА С БАЗОЙ ДАННЫХ ===
async function loadTasks(dateKey, weekMode = false) {
    if (!supabase || !state.currentUser) {
        console.warn('Supabase не инициализирован или пользователь не авторизован');
        return [];
    }

    try {
        let query = supabase
            .from('tasks')
            .select('*')
            .order('time_start');

        if (weekMode) {
            const weekDays = getWeekDays(new Date(dateKey));
            const dateKeys = weekDays.map(d => formatDateKey(d));
            query = query.in('date_key', dateKeys);
        } else {
            query = query.eq('date_key', dateKey);
        }

        const { data, error } = await query;
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Ошибка загрузки задач:', error);
        showSyncStatus('❌ Ошибка загрузки');
        return [];
    }
}

async function addTask(dateKey, timeStart, timeEnd, text) {
    if (!supabase || !state.currentUser || !text.trim()) {
        console.error('❌ Ошибка: Supabase или пользователь не инициализирован');
        return null;
    }

    const userId = state.currentUser.id;
    const userIndex = state.selectedUserIndex;

    console.log('📝 Добавление задачи:', {
        user_id: userId,
        user_index: userIndex,
        date_key: dateKey,
        time_start: timeStart || '12:00',
        time_end: timeEnd || '',
        text: text.trim()
    });

    try {
        const { data, error } = await supabase
            .from('tasks')
            .insert([{
                user_id: userId,
                user_index: userIndex,
                date_key: dateKey,
                time_start: timeStart || '12:00',
                time_end: timeEnd || '',
                text: text.trim()
            }])
            .select();

        if (error) {
            console.error('❌ Ошибка Supabase:', error);
            showSyncStatus('❌ ' + error.message);
            return null;
        }
        
        console.log('✅ Задача добавлена:', data);
        showSyncStatus('✅ Задача добавлена');
        return data[0];
    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
        showSyncStatus('❌ Ошибка: ' + error.message);
        return null;
    }
}

async function deleteTask(taskId) {
    if (!supabase || !state.currentUser || !taskId) return false;

    try {
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', taskId)
            .eq('user_id', state.currentUser.id);

        if (error) throw error;
        
        showSyncStatus('🗑️ Задача удалена');
        return true;
    } catch (error) {
        console.error('Ошибка удаления задачи:', error);
        showSyncStatus('❌ Ошибка удаления');
        return false;
    }
}

// === ПОДПИСКА НА ИЗМЕНЕНИЯ ===
function subscribeToTasks() {
    if (supabaseChannel) {
        supabaseChannel.unsubscribe();
    }

    if (!supabase || !state.currentUser) return;

    supabaseChannel = supabase
        .channel('tasks-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'tasks'
            },
            async (payload) => {
                console.log('🔄 Изменение в базе:', payload);
                render();
                showSyncStatus('🔄 Обновлено');
            }
        )
        .subscribe((status) => {
            console.log('📡 Подписка на изменения:', status);
        });
}

// === ОТРИСОВКА ===
function render() {
    renderUserSelector();
    renderDateNav();
    renderContent();
}

function renderUserSelector() {
    if (!state.currentUser) {
        userSelector.innerHTML = '';
        return;
    }

    let html = '';
    
    state.users.forEach((user, index) => {
        const isCurrent = index === state.selectedUserIndex;
        html += `
            <button class="user-btn ${isCurrent ? 'active' : ''}" 
                    data-user-index="${index}">
                <span class="color-dot" style="background:${user.color}"></span>
                ${escapeHtml(user.name)}
                ${isCurrent ? ' ✎' : ''}
            </button>
        `;
    });
    
    html += `
        <button class="user-btn" style="border-color:rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);">
            <span class="color-dot" style="background:transparent;border:1px solid rgba(255,255,255,0.3);"></span>
            <span style="font-weight:400;font-size:13px;">${escapeHtml(state.currentUser.email || '')}</span>
            <button class="logout-btn" id="logoutBtn">🚪</button>
        </button>
    `;
    
    userSelector.innerHTML = html;

    userSelector.querySelectorAll('[data-user-index]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.userIndex);
            if (state.selectedUserIndex !== index) {
                state.selectedUserIndex = index;
                render();
            }
        });
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Выйти из аккаунта?')) {
                signOut();
            }
        });
    }
}

function renderDateNav() {
    if (state.view === 'day') {
        dateDisplay.textContent = formatDateDisplay(state.currentDate);
    } else {
        dateDisplay.textContent = formatWeekRange(state.currentDate);
    }
}

function renderContent() {
    if (state.view === 'day') {
        renderDayView();
    } else {
        renderWeekView();
    }
}

function renderDayView() {
    const dateKey = formatDateKey(state.currentDate);
    
    loadTasks(dateKey).then(allTasks => {
        state.tasks = allTasks;
        
        let html = '<div class="day-view">';
        
        for (let u = 0; u < state.users.length; u++) {
            const user = state.users[u];
            const userTasks = allTasks.filter(t => t.user_index === u);
            const isCurrentUser = u === state.selectedUserIndex;
            
            html += `
                <div class="day-card">
                    <div class="day-card-header">
                        <div class="color-bar" style="background:${user.color}"></div>
                        <span class="user-name">${escapeHtml(user.name)}</span>
                        <span class="badge">${isCurrentUser ? '✎ вы' : '👀 просмотр'}</span>
                    </div>
                    <div class="tasks" data-date="${dateKey}">
            `;
            
            if (userTasks.length === 0) {
                html += `<div class="task-empty">${isCurrentUser ? 'Нет планов 🌸' : '—'}</div>`;
            } else {
                userTasks.sort((a, b) => a.time_start.localeCompare(b.time_start));
                userTasks.forEach(task => {
                    const timeDisplay = task.time_end ? 
                        `${escapeHtml(task.time_start)}–${escapeHtml(task.time_end)}` : 
                        escapeHtml(task.time_start);
                    
                    const isOwn = task.user_id === state.currentUser.id;
                    
                    html += `
                        <div class="task-item ${!isOwn ? 'other-user' : ''}" data-task-id="${task.id}">
                            <span class="task-time">${timeDisplay}</span>
                            <span class="task-text">${escapeHtml(task.text)}</span>
                            ${isOwn ? `
                                <div class="task-actions">
                                    <button class="task-btn delete" data-action="delete" 
                                            data-task-id="${task.id}" 
                                            data-task-text="${escapeHtml(task.text)}">✕</button>
                                </div>
                            ` : ''}
                        </div>
                    `;
                });
            }
            
            html += `
                    </div>
                    ${isCurrentUser ? `
                        <div class="add-task-form" data-date="${dateKey}">
                            <div class="time-group">
                                <input type="time" class="task-time-start" value="12:00">
                                <span>–</span>
                                <input type="time" class="task-time-end" value="">
                            </div>
                            <input type="text" class="task-text-input" placeholder="Что планируете?" maxlength="100">
                            <button class="add-btn" data-action="add">+</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        html += '</div>';
        content.innerHTML = html;
        attachTaskEvents();
    });
}

function renderWeekView() {
    const weekDays = getWeekDays(state.currentDate);
    const weekDayNames = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
    const dateKey = formatDateKey(state.currentDate);
    
    loadTasks(dateKey, true).then(allTasks => {
        state.tasks = allTasks;
        
        let html = '<div class="week-compact">';
        
        for (let u = 0; u < state.users.length; u++) {
            const user = state.users[u];
            const isCurrentUser = u === state.selectedUserIndex;
            
            html += `
                <div class="week-card">
                    <div class="week-header">
                        <div class="color-bar" style="background:${user.color}"></div>
                        <span class="user-name">${escapeHtml(user.name)}</span>
                        <span class="badge">${isCurrentUser ? '✎ вы' : '👀 просмотр'}</span>
                    </div>
            `;
            
            weekDays.forEach((day, idx) => {
                const dayKey = formatDateKey(day);
                const dayTasks = allTasks.filter(t => t.date_key === dayKey && t.user_index === u);
                const today = isToday(day);
                const dayName = weekDayNames[idx];
                const dayNum = day.getDate();
                
                html += `
                    <div class="week-day-row" data-date="${dayKey}">
                        <div class="day-label ${today ? 'today' : ''}">${dayName} ${dayNum}</div>
                        <div class="day-tasks">
                `;
                
                if (dayTasks.length === 0) {
                    html += `<span class="week-empty-text">—</span>`;
                } else {
                    dayTasks.sort((a, b) => a.time_start.localeCompare(b.time_start));
                    dayTasks.forEach(task => {
                        const timeDisplay = task.time_end ? 
                            `${escapeHtml(task.time_start)}–${escapeHtml(task.time_end)}` : 
                            escapeHtml(task.time_start);
                        const isOwn = task.user_id === state.currentUser.id;
                        
                        html += `
                            <span class="wtask">
                                <span class="wtask-time">${timeDisplay}</span>
                                ${escapeHtml(task.text)}
                                ${isOwn ? `
                                    <button class="wtask-delete" data-action="delete" 
                                            data-task-id="${task.id}" 
                                            data-task-text="${escapeHtml(task.text)}">✕</button>
                                ` : ''}
                            </span>
                        `;
                    });
                }
                
                html += `
                        </div>
                    </div>
                `;
            });
            
            if (isCurrentUser) {
                html += `
                    <div class="week-add-form">
                        <select class="wa-day-select">
                            ${weekDays.map((day, idx) => `
                                <option value="${formatDateKey(day)}">${weekDayNames[idx]} ${day.getDate()}</option>
                            `).join('')}
                        </select>
                        <div class="time-group">
                            <input type="time" class="wa-time-start" value="12:00">
                            <span>–</span>
                            <input type="time" class="wa-time-end" value="">
                        </div>
                        <input type="text" class="wa-text-input" placeholder="План" maxlength="60">
                        <button class="add-btn" data-action="add-week">+</button>
                    </div>
                `;
            }
            
            html += `</div>`;
        }
        
        html += '</div>';
        content.innerHTML = html;
        attachWeekEvents();
    });
}

// === ОБРАБОТЧИКИ СОБЫТИЙ ===
function attachTaskEvents() {
    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskId = btn.dataset.taskId;
            const taskText = btn.dataset.taskText || 'Задача';
            showDeleteModal(taskId, taskText);
        });
    });
    
    document.querySelectorAll('[data-action="add"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const form = btn.closest('.add-task-form');
            const timeStart = form.querySelector('.task-time-start');
            const timeEnd = form.querySelector('.task-time-end');
            const textInput = form.querySelector('.task-text-input');
            const dateKey = form.dataset.date;
            
            const start = timeStart.value || '12:00';
            const end = timeEnd.value || '';
            const text = textInput.value.trim();
            
            if (!text) {
                textInput.focus();
                textInput.style.borderColor = '#e74c3c';
                setTimeout(() => textInput.style.borderColor = '', 2000);
                return;
            }
            
            await addTask(dateKey, start, end, text);
            render();
        });
    });
    
    document.querySelectorAll('.task-text-input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const form = input.closest('.add-task-form');
                const addBtn = form.querySelector('[data-action="add"]');
                if (addBtn) addBtn.click();
            }
        });
    });
}

function attachWeekEvents() {
    document.querySelectorAll('.wtask-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskId = btn.dataset.taskId;
            const taskText = btn.dataset.taskText || 'Задача';
            showDeleteModal(taskId, taskText);
        });
    });
    
    document.querySelectorAll('[data-action="add-week"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const form = btn.closest('.week-add-form');
            const daySelect = form.querySelector('.wa-day-select');
            const timeStart = form.querySelector('.wa-time-start');
            const timeEnd = form.querySelector('.wa-time-end');
            const textInput = form.querySelector('.wa-text-input');
            
            const dateKey = daySelect.value;
            const start = timeStart.value || '12:00';
            const end = timeEnd.value || '';
            const text = textInput.value.trim();
            
            if (!text) {
                textInput.focus();
                textInput.style.borderColor = '#e74c3c';
                setTimeout(() => textInput.style.borderColor = '', 2000);
                return;
            }
            
            await addTask(dateKey, start, end, text);
            render();
        });
    });
    
    document.querySelectorAll('.wa-text-input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const form = input.closest('.week-add-form');
                const addBtn = form.querySelector('[data-action="add-week"]');
                if (addBtn) addBtn.click();
            }
        });
    });
}

// === МОДАЛЬНОЕ ОКНО УДАЛЕНИЯ ===
function showDeleteModal(taskId, taskText) {
    deleteTarget = taskId;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'deleteModal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-icon">🗑️</div>
            <h3>Удалить задачу?</h3>
            <p>Вы уверены, что хотите удалить эту задачу?</p>
            <div class="task-preview">${escapeHtml(taskText)}</div>
            <div class="modal-actions">
                <button class="btn-cancel" id="modalCancel">Отмена</button>
                <button class="btn-delete" id="modalConfirm">Удалить</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('modalCancel').addEventListener('click', () => {
        closeModal();
    });

    document.getElementById('modalConfirm').addEventListener('click', async () => {
        if (deleteTarget) {
            await deleteTask(deleteTarget);
            deleteTarget = null;
            closeModal();
            render();
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

function closeModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) modal.remove();
    deleteTarget = null;
}

// === НАВИГАЦИЯ ===
document.getElementById('prevDate').addEventListener('click', () => {
    if (state.view === 'day') {
        state.currentDate.setDate(state.currentDate.getDate() - 1);
    } else {
        state.currentDate.setDate(state.currentDate.getDate() - 7);
    }
    render();
});

document.getElementById('nextDate').addEventListener('click', () => {
    if (state.view === 'day') {
        state.currentDate.setDate(state.currentDate.getDate() + 1);
    } else {
        state.currentDate.setDate(state.currentDate.getDate() + 7);
    }
    render();
});

document.getElementById('todayBtn').addEventListener('click', () => {
    state.currentDate = new Date();
    render();
});

// === ПЕРЕКЛЮЧЕНИЕ ВИДОВ ===
document.getElementById('viewDay').addEventListener('click', () => {
    state.view = 'day';
    document.getElementById('viewDay').classList.add('active');
    document.getElementById('viewWeek').classList.remove('active');
    render();
});

document.getElementById('viewWeek').addEventListener('click', () => {
    state.view = 'week';
    document.getElementById('viewWeek').classList.add('active');
    document.getElementById('viewDay').classList.remove('active');
    render();
});

// === ПРИВЕТСТВИЕ ===
const welcomeBtn = document.getElementById('welcomeBtn');
welcomeBtn.addEventListener('click', () => {
    welcomeOverlay.style.opacity = '0';
    welcomeOverlay.style.transition = 'opacity 0.5s ease';
    setTimeout(() => {
        welcomeOverlay.style.display = 'none';
    }, 500);
});

// === АВТОРИЗАЦИЯ ===
document.getElementById('signInBtn').addEventListener('click', () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (email && password) {
        signIn(email, password);
    } else {
        authError.textContent = '❌ Введите email и пароль';
    }
});

document.getElementById('signUpBtn').addEventListener('click', () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (email && password && password.length >= 6) {
        signUp(email, password);
    } else if (password.length < 6) {
        authError.textContent = '❌ Пароль должен быть не менее 6 символов';
    } else {
        authError.textContent = '❌ Введите email и пароль';
    }
});

document.getElementById('authEmail').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('authPassword').focus();
    }
});

document.getElementById('authPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('signInBtn').click();
    }
});

// === ИНИЦИАЛИЗАЦИЯ ===
checkAuth();