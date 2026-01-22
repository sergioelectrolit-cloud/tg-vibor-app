// --- 1. КОНФИГУРАЦИЯ FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBn6YiMrM3wabyY9fry6iC06qC6cgX160E",
  authDomain: "tgvibor.firebaseapp.com",
  projectId: "tgvibor",
  storageBucket: "tgvibor.firebasestorage.app",
  messagingSenderId: "884340908169",
  appId: "1:884340908169:web:7b1e3a2375625a49a3e658",
  measurementId: "G-6N9RZVW8N2"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. ПЕРЕМЕННЫЕ ---
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

let allCards = [], filteredCards = [], adsData = [];
let currentIndex = 0, adIndex = 0, viewedCount = 0, isAdMode = false;
let nextAdThreshold = 10;
let lastUserChoice = null;

let userHistory = JSON.parse(localStorage.getItem('swipe_history')) || [];

// --- 3. ИНИЦИАЛИЗАЦИЯ ---
async function init() {
    try {
        const [cRes, aRes] = await Promise.all([
            fetch('cards.json?v=' + Date.now()),
            fetch('ads.json?v=' + Date.now())
        ]);
        allCards = await cRes.json();
        adsData = await aRes.json();
    } catch (e) { console.error("Init Error", e); }
}

// --- 4. НАВИГАЦИЯ ---
function startGame(category) {
    tg.HapticFeedback.impactOccurred('medium');
    filteredCards = category === 'all' ? [...allCards] : allCards.filter(c => c.category === category);
    if (filteredCards.length === 0) return;

    currentIndex = 0; viewedCount = 0;
    document.getElementById('menuView').style.display = 'none';
    document.getElementById('gameView').style.display = 'flex';
    
    tg.BackButton.show();
    tg.BackButton.onClick(goBackToMenu);
    renderCard();
}

function goBackToMenu() {
    tg.HapticFeedback.impactOccurred('light');
    tg.BackButton.hide();
    document.getElementById('gameView').style.display = 'none';
    document.getElementById('menuView').style.display = 'flex';
}

// --- 5. ИГРОВАЯ ЛОГИКА ---
function renderCard() {
    const el = document.getElementById('cardElement');
    const badge = document.getElementById('adBadge');
    lastUserChoice = null; // Сброс выбора для новой карточки
    
    if (viewedCount >= nextAdThreshold && adsData.length > 0) {
        isAdMode = true;
        const ad = adsData[adIndex];
        document.getElementById('cardText').innerText = ad.text;
        el.style.backgroundImage = `url('${ad.image}')`;
        badge.style.display = 'block';
        document.getElementById('actionButtons').style.display = 'none';
        document.getElementById('statsSection').style.display = 'none';
        document.getElementById('adButtons').style.display = 'flex';
        adIndex = (adIndex + 1) % adsData.length;
    } else {
        isAdMode = false;
        const card = filteredCards[currentIndex];
        document.getElementById('cardText').innerText = card.text;
        el.style.backgroundImage = `url('${card.image}')`;
        badge.style.display = 'none';
        document.getElementById('actionButtons').style.display = 'flex';
        document.getElementById('statsSection').style.display = 'none';
        document.getElementById('adButtons').style.display = 'none';
    }

    const container = document.getElementById('cardContainer');
    container.classList.remove('slide-up');
    container.classList.add('slide-in');
    setTimeout(() => container.classList.remove('slide-in'), 500);
}

function vote(type) {
    if (isAdMode) return;
    tg.HapticFeedback.impactOccurred('medium');
    lastUserChoice = type;
    
    const card = filteredCards[currentIndex];
    
    userHistory.unshift({
        text: card.text,
        choice: type === 'understand' ? 'ПОНИМАЮ 🤝' : 'ОСУЖДАЮ 👎',
        color: type === 'understand' ? '#34c759' : '#ff3b30'
    });
    if (userHistory.length > 30) userHistory.pop();
    localStorage.setItem('swipe_history', JSON.stringify(userHistory));

    if (type === 'understand') card.understand++;
    else card.condemn++;

    const total = card.understand + card.condemn;
    const uP = Math.round((card.understand / total) * 100);
    const cP = 100 - uP;

    document.getElementById('labelUnderstand').innerText = `${uP}% ПОНИМАЮТ`;
    document.getElementById('labelCondemn').innerText = `${cP}% ОСУЖДАЮТ`;
    
    document.getElementById('actionButtons').style.display = 'none';
    document.getElementById('statsSection').style.display = 'block';

    setTimeout(() => {
        document.getElementById('statUnderstand').style.width = uP + '%';
        document.getElementById('statCondemn').style.width = cP + '%';
    }, 50);
}

function nextCard() {
    tg.HapticFeedback.selectionChanged();
    document.getElementById('cardContainer').classList.add('slide-up');
    setTimeout(() => {
        if (isAdMode) { viewedCount = 0; nextAdThreshold = Math.floor(Math.random() * 5) + 10; }
        else { currentIndex = (currentIndex + 1) % filteredCards.length; viewedCount++; }
        renderCard();
    }, 400);
}

// --- 6. КОММЕНТАРИИ ---
function updateCharCounter() {
    const input = document.getElementById('commentInput');
    const counter = document.getElementById('charCounter');
    counter.innerText = `${input.value.length} / 500`;
}

async function openComments() {
    const cardId = filteredCards[currentIndex].id.toString();
    const list = document.getElementById('commentsList');
    list.innerHTML = '<p class="status-msg">Загрузка мнений...</p>';
    document.getElementById('commentsModal').style.display = 'flex';

    try {
        const snapshot = await db.collection('comments')
            .where('cardId', '==', cardId)
            .orderBy('createdAt', 'desc')
            .limit(40).get();

        if (snapshot.empty) {
            list.innerHTML = '<p class="status-msg">Здесь пока пусто. Будь первым!</p>';
            return;
        }

        list.innerHTML = snapshot.docs.map(doc => {
            const c = doc.data();
            return `
                <div class="comment-item">
                    <div class="author-info">
                        <div class="vote-badge ${c.choice === 'understand' ? 'badge-u' : 'badge-c'}"></div>
                        <b>${escapeHtml(c.name)}</b>
                    </div>
                    <p>${escapeHtml(c.text)}</p>
                </div>
            `;
        }).join('');
    } catch (e) { 
        console.error(e);
        list.innerHTML = '<p class="status-msg" style="color:red;">Нужно создать индекс в Firebase</p>'; 
    }
}

async function addComment() {
    const input = document.getElementById('commentInput');
    const isAnon = document.getElementById('anonCheckbox').checked;
    const text = input.value.trim();
    const sendBtn = document.getElementById('sendCommentBtn');

    if (!text) return;
    if (!lastUserChoice) {
        tg.showAlert("Сначала сделай выбор (Понимаю или Осуждаю)!");
        return;
    }

    sendBtn.disabled = true;
    const cardId = filteredCards[currentIndex].id.toString();
    
    // Определяем имя пользователя
    let userName = "Аноним";
    if (!isAnon && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const u = tg.initDataUnsafe.user;
        userName = u.username ? `@${u.username}` : `${u.first_name} ${u.last_name || ''}`.trim();
    }

    try {
        await db.collection('comments').add({
            cardId: cardId,
            name: userName,
            text: text,
            choice: lastUserChoice,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        input.value = '';
        document.getElementById('anonCheckbox').checked = false;
        updateCharCounter();
        await openComments();
        tg.HapticFeedback.notificationOccurred('success');
    } catch (e) { 
        alert("Ошибка при отправке"); 
        console.error(e);
    } finally {
        sendBtn.disabled = false;
    }
}

function closeComments() { document.getElementById('commentsModal').style.display = 'none'; }

// Защита от XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- 7. ВСПОМОГАТЕЛЬНОЕ ---
function toggleHistory(show) {
    const m = document.getElementById('historyModal');
    if (show) {
        document.getElementById('historyList').innerHTML = userHistory.length ? 
            userHistory.map(h => `<div class="history-item"><span>${h.text.slice(0,30)}...</span><b style="color:${h.color}">${h.choice}</b></div>`).join('') :
            '<p style="text-align:center; opacity:0.5;">История пуста</p>';
        m.style.display = 'flex';
    } else m.style.display = 'none';
}

function shareApp() {
    const url = `https://t.me/your_bot/app?startapp=ref_${tg.initDataUnsafe.user?.id || 0}`;
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=Зацени игру "Понимаю или Осуждаю"!`);
}

function openAdLink() { 
    const link = adsData[(adIndex-1+adsData.length)%adsData.length].link;
    tg.openTelegramLink(link); 
}

init();