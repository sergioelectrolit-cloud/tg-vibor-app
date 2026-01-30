const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// 1. КОНФИГУРАЦИЯ ТЕМ
// Просто добавляйте имя файла в этот массив, и он автоматически подтянется в общую ленту
const JSON_FILES = [
    'general.json',
    'partnership.json',
    'work.json',
    'friends.json',
    'food.json',
    'lifestyle.json'
];

// 2. СОСТОЯНИЕ ПРИЛОЖЕНИЯ
let allCards = [];      // Все перемешанные карточки
let adsData = [];       // Рекламные блоки
let allComments = {};   // Объект с комментариями { "work_1": [...], "general_5": [...] }
let userHistory = JSON.parse(localStorage.getItem('userHistory') || '[]');
let userLocalChoices = JSON.parse(localStorage.getItem('userLocalChoices') || '{}'); // Сохраняем выборы игрока
let userStats = { 
    understand: Object.values(userLocalChoices).filter(v => v === 'understand').length,
    condemn: Object.values(userLocalChoices).filter(v => v === 'condemn').length,
    total: Object.keys(userLocalChoices).length
};

let loadedCount = 0; // Порядковый номер в ленте
let currentDataIdForComments = null; // ID карточки, чьи комменты сейчас открыты

const feedContainer = document.getElementById('feedContainer');

// 3. ИНИЦИАЛИЗАЦИЯ
async function initApp() {
    try {
        // Загружаем системные файлы
        const [adsRes, commRes] = await Promise.all([
            fetch('ads.json').then(r => r.json()).catch(() => []),
            fetch('comments.json').then(r => r.json()).catch(() => ({}))
        ]);
        adsData = adsRes;
        allComments = commRes;

        // Загружаем темы и присваиваем префиксы ID
        let cardsBuffer = [];
        const loadPromises = JSON_FILES.map(async (file) => {
            try {
                const r = await fetch(file);
                const data = await r.json();
                const prefix = file.split('.')[0]; // Получаем 'work' из 'work.json'
                
                return data.map(item => ({
                    ...item,
                    id: `${prefix}_${item.id}` // Глобально уникальный ID
                }));
            } catch (e) {
                console.error(`Ошибка загрузки файла ${file}:`, e);
                return [];
            }
        });

        const results = await Promise.all(loadPromises);
        allCards = results.flat().sort(() => Math.random() - 0.5);

        if (allCards.length === 0) {
            feedContainer.innerHTML = '<div style="padding:50px; text-align:center;">Ошибка загрузки данных. Проверьте JSON файлы.</div>';
            return;
        }

        // Запускаем ленту
        loadMore(5);

    } catch (e) {
        console.error("Критическая ошибка:", e);
    }
}

// Стартуем сразу
initApp();

// 4. БЕСКОНЕЧНЫЙ СКРОЛЛ
feedContainer.addEventListener('scroll', () => {
    // Если до конца ленты осталось меньше 2-х экранов — добавляем еще
    if (feedContainer.scrollTop + feedContainer.clientHeight >= feedContainer.scrollHeight - (window.innerHeight * 2)) {
        loadMore(5);
    }
});

function loadMore(count) {
    for (let i = 0; i < count; i++) {
        // Берем карточку по кругу через остаток от деления
        const dataIndex = loadedCount % allCards.length;
        const cardData = allCards[dataIndex];
        const instanceId = `view-${loadedCount}`; // ID для DOM

        // Рекламная пауза каждые 8 карточек
        if (loadedCount > 0 && loadedCount % 8 === 0 && adsData.length > 0) {
            const ad = adsData[Math.floor(Math.random() * adsData.length)];
            feedContainer.appendChild(createAdElement(ad));
        }

        feedContainer.appendChild(createCardElement(cardData, instanceId));
        loadedCount++;
    }
}

// 5. СОЗДАНИЕ ЭЛЕМЕНТОВ
function createCardElement(data, instanceId) {
    const div = document.createElement('div');
    div.className = 'card';
    div.setAttribute('data-category', data.category || 'general');
    
    // Фон: цвет или картинка
    if (data.image && data.image.startsWith('#')) {
        div.style.backgroundColor = data.image;
    } else if (data.image) {
        div.style.backgroundImage = `url(${data.image})`;
    }

    // Проверяем, голосовал ли уже пользователь за эту КАРТУ (по data.id)
    const existingChoice = userLocalChoices[data.id];
    const isAnswered = !!existingChoice;

    div.innerHTML = `
        <div class="overlay"></div>
        <div class="content">
            <div class="card-text">${data.text}</div>
            
            <!-- БЛОК КНОПОК -->
            <div class="actions" id="actions-${instanceId}" style="display: ${isAnswered ? 'none' : 'flex'}">
                <button class="btn btn-condemn" onclick="vote('${instanceId}', '${data.id}', 'condemn', ${data.understand}, ${data.condemn})">Осуждаю 👎</button>
                <button class="btn btn-understand" onclick="vote('${instanceId}', '${data.id}', 'understand', ${data.understand}, ${data.condemn})">Понимаю 🤝</button>
            </div>

            <!-- БЛОК СТАТИСТИКИ -->
            <div class="stats" id="stats-${instanceId}" style="display: ${isAnswered ? 'block' : 'none'}">
                <div class="stat-rows">
                    <div id="val-u-${instanceId}" class="stat-row-item color-u"></div>
                    <div id="val-c-${instanceId}" class="stat-row-item color-c"></div>
                </div>
                <div class="stat-bar-container">
                    <div id="bar-u-${instanceId}" class="stat-part bar-u"></div>
                    <div id="bar-c-${instanceId}" class="stat-part bar-c"></div>
                </div>
                <div class="result-actions">
                    <button class="share-btn" onclick="shareApp()">🚀 Share</button>
                    <button class="discuss-btn" onclick="openComments('${data.id}')">💬 Мнения</button>
                </div>
                <div class="swipe-hint">Листай дальше ↓</div>
            </div>
        </div>
    `;

    // Если уже отвечали, сразу рисуем статистику
    if (isAnswered) {
        setTimeout(() => updateStatsDisplay(instanceId, data.understand, data.condemn, existingChoice), 0);
    }

    return div;
}

function createAdElement(ad) {
    const div = document.createElement('div');
    div.className = 'card ad-card';
    if (ad.image) div.style.backgroundImage = `url(${ad.image})`;
    div.innerHTML = `
        <div class="overlay"></div>
        <div class="content">
            <div class="ad-badge">РЕКЛАМА</div>
            <div class="card-text">${ad.text}</div>
            <button class="join-btn" onclick="tg.openTelegramLink('${ad.link}')">Перейти 📢</button>
            <div class="swipe-hint" style="margin-top:20px">Пропустить ↓</div>
        </div>
    `;
    return div;
}

// 6. ЛОГИКА ГОЛОСОВАНИЯ
function vote(instanceId, dataId, type, uCount, cCount) {
    // 1. Сохраняем локально
    userLocalChoices[dataId] = type;
    localStorage.setItem('userLocalChoices', JSON.stringify(userLocalChoices));
    
    // 2. Обновляем статистику сессии
    userStats.total++;
    userStats[type]++;
    
    // 3. Добавляем в историю
    const cardData = allCards.find(c => c.id === dataId);
    userHistory.unshift({ text: cardData.text, choice: type === 'understand' ? '🤝' : '👎' });
    localStorage.setItem('userHistory', JSON.stringify(userHistory.slice(0, 50)));

    // 4. Обновляем UI
    document.getElementById(`actions-${instanceId}`).style.display = 'none';
    document.getElementById(`stats-${instanceId}`).style.display = 'block';
    
    // Добавляем +1 к текущим числам для отображения
    if (type === 'understand') uCount++; else cCount++;
    updateStatsDisplay(instanceId, uCount, cCount);

    // 5. Каждые 10 голосов — модалка сравнения
    if (userStats.total % 10 === 0) openCompareModal();
}

function updateStatsDisplay(instanceId, uCount, cCount, choice) {
    const total = uCount + cCount;
    const uP = Math.round((uCount / total) * 100);
    const cP = 100 - uP;

    const valU = document.getElementById(`val-u-${instanceId}`);
    const valC = document.getElementById(`val-c-${instanceId}`);
    const barU = document.getElementById(`bar-u-${instanceId}`);
    const barC = document.getElementById(`bar-c-${instanceId}`);

    if (valU) valU.innerText = `${uP}% ПОНИМАЮТ`;
    if (valC) valC.innerText = `${cP}% ОСУЖДАЮТ`;
    if (barU) barU.style.width = uP + '%';
    if (barC) barC.style.width = cP + '%';
}

// 7. КОММЕНТАРИИ
function openComments(dataId) {
    currentDataIdForComments = dataId;
    document.getElementById('commentsModal').style.display = 'flex';
    renderComments();
}

function renderComments() {
    const list = document.getElementById('commentsList');
    const comments = allComments[currentDataIdForComments] || [];
    
    if (comments.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:gray; padding:20px;">Пока никто не высказался. Будьте первым!</p>';
        return;
    }

    list.innerHTML = comments.map(c => {
        // Выбор автора: если в базе нет, берем нейтральный
        const choiceClass = c.choice === 'understand' ? 'badge-u' : (c.choice === 'condemn' ? 'badge-c' : '');
        return `
            <div class="comment-item">
                <div class="author-info">
                    <div class="vote-badge ${choiceClass}"></div>
                    <b>${c.author || 'Игрок'}</b>
                </div>
                <p>${c.text}</p>
            </div>
        `;
    }).join('');
}

function addComment() {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    if (!text) return;

    const isAnon = document.getElementById('anonCheckbox').checked;
    const myChoice = userLocalChoices[currentDataIdForComments] || 'none';

    const newComm = {
        choice: myChoice,
        author: isAnon ? 'Анонимно' : (tg.initDataUnsafe?.user?.first_name || 'Игрок'),
        text: text
    };

    if (!allComments[currentDataIdForComments]) allComments[currentDataIdForComments] = [];
    allComments[currentDataIdForComments].unshift(newComm);
    
    input.value = '';
    updateCharCounter();
    renderComments();
}

function updateCharCounter() {
    const len = document.getElementById('commentInput').value.length;
    document.getElementById('charCounter').innerText = `${len} / 500`;
}

function closeComments() { document.getElementById('commentsModal').style.display = 'none'; }

// 8. ВСПОМОГАТЕЛЬНЫЕ ОКНА
function toggleHistory(show) {
    const modal = document.getElementById('historyModal');
    modal.style.display = show ? 'flex' : 'none';
    if(show) {
        const list = document.getElementById('historyList');
        list.innerHTML = userHistory.length ? userHistory.map(h => `
            <div class="history-item"><span>${h.text}</span><b>${h.choice}</b></div>
        `).join('') : '<p style="text-align:center; color:gray;">Тут будет ваш список выборов</p>';
    }
}

function openCompareModal() {
    const u = Math.round((userStats.understand / userStats.total) * 100);
    document.getElementById('compareContent').innerHTML = `
        <div style="text-align:center;">
            <p style="font-size:20px; margin-bottom:10px;">Вы понимаете людей в <b>${u}%</b> случаев!</p>
            <p style="color:gray; font-size:14px;">Статистика на основе последних ${userStats.total} выборов.</p>
        </div>
    `;
    document.getElementById('compareModal').style.display = 'flex';
}

function closeCompare() { document.getElementById('compareModal').style.display = 'none'; }

function shareApp() {
    const uP = userStats.total > 0 ? Math.round((userStats.understand / userStats.total) * 100) : 0;
    const text = encodeURIComponent(`Я понимаю людей на ${uP}%! Попробуй и ты в игре "Понимаю или Осуждаю" 🤝👎`);
    tg.openTelegramLink(`https://t.me/share/url?url=https://t.me/YourBotLink&text=${text}`);
}
