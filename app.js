// ===== Configuration =====
const CONFIG = {
    GEOCODING_API: 'https://geocoding-api.open-meteo.com/v1/search',
    WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
    STORAGE_KEY_FAVORITES: 'meteo-pwa-favorites',
    STORAGE_KEY_THEME: 'meteo-pwa-theme',
    RAIN_CODES: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99],
    TEMP_THRESHOLD: 10 // Température seuil pour notification
};

// ===== Éléments DOM =====
const elements = {
    cityInput: document.getElementById('city-input'),
    searchBtn: document.getElementById('search-btn'),
    notifyBtn: document.getElementById('notify-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    weatherSection: document.getElementById('weather-section'),
    favoritesSection: document.getElementById('favorites-section'),
    favoritesList: document.getElementById('favorites-list'),
    favoriteBtn: document.getElementById('favorite-btn'),
    cityName: document.getElementById('city-name'),
    temperature: document.getElementById('temperature'),
    weatherIcon: document.getElementById('weather-icon'),
    wind: document.getElementById('wind'),
    humidity: document.getElementById('humidity'),
    feelsLike: document.getElementById('feels-like'),
    hourlyList: document.getElementById('hourly-list'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('error-message')
};

// ===== État de l'application =====
let currentCity = null;
let swRegistration = null; // ✅ AJOUT : Stocker l'enregistrement du SW

// ===== Initialisation =====
document.addEventListener('DOMContentLoaded', () => {
    updateNotifyButton();
    registerServiceWorker();
    
    elements.searchBtn.addEventListener('click', handleSearch);
    elements.notifyBtn.addEventListener('click', requestNotificationPermission);
    
    elements.cityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
});

// ===== Service Worker =====
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            swRegistration = await navigator.serviceWorker.register('./service-worker.js');
            console.log('✅ Service Worker enregistré:', swRegistration.scope);
            
            // ✅ Attendre que le SW soit actif
            await navigator.serviceWorker.ready;
            console.log('✅ Service Worker prêt');
        } catch (error) {
            console.error('❌ Erreur Service Worker:', error);
        }
    }
}

// ===== Notifications =====
function isNotificationSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator;
}

function updateNotifyButton() {
    if (!isNotificationSupported()) {
        elements.notifyBtn.textContent = '🔔 Non disponible';
        elements.notifyBtn.disabled = true;
        return;
    }

    const permission = Notification.permission;
    
    if (permission === 'granted') {
        elements.notifyBtn.textContent = '✅ Notifications activées';
        elements.notifyBtn.classList.add('granted');
        elements.notifyBtn.classList.remove('denied');
    } else if (permission === 'denied') {
        elements.notifyBtn.textContent = '❌ Notifications bloquées';
        elements.notifyBtn.classList.add('denied');
        elements.notifyBtn.classList.remove('granted');
    } else {
        elements.notifyBtn.textContent = '🔔 Activer les notifications';
        elements.notifyBtn.classList.remove('granted', 'denied');
    }
}

async function requestNotificationPermission() {
    if (!isNotificationSupported()) {
        showError('Les notifications ne sont pas supportées par votre navigateur.');
        return;
    }

    if (Notification.permission === 'denied') {
        showError('Les notifications sont bloquées. Veuillez les réactiver dans les paramètres de votre navigateur.');
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        updateNotifyButton();
        
        if (permission === 'granted') {
            // ✅ Notification de test via Service Worker
            await sendNotification(
                'MétéoPWA',
                'Les notifications sont maintenant activées ! 🎉',
                'info'
            );
        }
    } catch (error) {
        console.error('Erreur lors de la demande de permission:', error);
        showError('Erreur lors de l\'activation des notifications.');
    }
}

// ✅ NOUVELLE FONCTION : Envoi unifié de notifications
async function sendNotification(title, body, tag = 'default') {
    if (!isNotificationSupported() || Notification.permission !== 'granted') {
        console.log('Notifications non disponibles ou non autorisées');
        return;
    }

    try {
        // Attendre que le SW soit prêt
        const registration = await navigator.serviceWorker.ready;
        
        // Options de notification
        const options = {
            body: body,
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-96.png',
            tag: tag,
            requireInteraction: false,
            vibrate: [200, 100, 200],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: tag
            }
        };

        // ✅ Utiliser showNotification du Service Worker
        await registration.showNotification(title, options);
        console.log(`📬 Notification envoyée: ${title} - ${body}`);
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'envoi de la notification:', error);
        
        // ✅ FALLBACK : Sur desktop, utiliser le constructeur classique
        if (!navigator.userAgent.match(/Android|iPhone|iPad/i)) {
            try {
                new Notification(title, {
                    body: body,
                    icon: 'icons/icon-192.png',
                    tag: tag
                });
                console.log('📬 Notification desktop envoyée (fallback)');
            } catch (e) {
                console.error('❌ Fallback échoué:', e);
            }
        }
    }
}

// ✅ FONCTION SIMPLIFIÉE
async function sendWeatherNotification(city, message, type = 'info') {
    const icons = {
        rain: '🌧️',
        temp: '🌡️',
        info: 'ℹ️'
    };
    
    const title = `${icons[type]} ${city}`;
    await sendNotification(title, message, `weather-${type}`);
}

// ===== Recherche et API Météo =====
async function handleSearch() {
    const query = elements.cityInput.value.trim();
    
    if (!query) {
        showError('Veuillez entrer un nom de ville.');
        return;
    }

    showLoading();
    hideError();

    try {
        const geoResponse = await fetch(
            `${CONFIG.GEOCODING_API}?name=${encodeURIComponent(query)}&count=1&language=fr&format=json`
        );
        
        if (!geoResponse.ok) throw new Error('Erreur de géocodage');
        
        const geoData = await geoResponse.json();
        
        if (!geoData.results || geoData.results.length === 0) {
            throw new Error(`Ville "${query}" non trouvée. Vérifiez l'orthographe.`);
        }

        const location = geoData.results[0];
        const cityName = `${location.name}${location.admin1 ? ', ' + location.admin1 : ''}, ${location.country}`;
        
        await fetchWeather(location.latitude, location.longitude, cityName);
        
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

async function fetchWeather(lat, lon, cityName) {
    showLoading();
    hideError();

    try {
        const weatherResponse = await fetch(
            `${CONFIG.WEATHER_API}?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
            `&hourly=temperature_2m,weather_code,precipitation_probability` +
            `&timezone=auto&forecast_days=1`
        );

        if (!weatherResponse.ok) throw new Error('Erreur lors de la récupération des données météo');

        const weatherData = await weatherResponse.json();
        
        currentCity = { name: cityName, lat, lon };
        
        displayWeather(weatherData, cityName);
        checkWeatherAlerts(weatherData, cityName);
        
        hideLoading();
        
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function displayWeather(data, cityName) {
    const current = data.current;
    const hourly = data.hourly;

    elements.cityName.textContent = cityName;
    elements.temperature.textContent = Math.round(current.temperature_2m);
    elements.weatherIcon.textContent = getWeatherEmoji(current.weather_code);
    elements.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    elements.humidity.textContent = `${current.relative_humidity_2m} %`;
    elements.feelsLike.textContent = `${Math.round(current.apparent_temperature)}°C`;

    const currentHour = new Date().getHours();
    const hourlyItems = [];
    
    for (let i = 0; i < 4; i++) {
        const hourIndex = currentHour + i + 1;
        if (hourIndex < hourly.time.length) {
            const time = new Date(hourly.time[hourIndex]);
            const temp = hourly.temperature_2m[hourIndex];
            const code = hourly.weather_code[hourIndex];
            const isRain = CONFIG.RAIN_CODES.includes(code);
            const isHighTemp = temp > CONFIG.TEMP_THRESHOLD;
            
            let alertClass = '';
            if (isRain) alertClass = 'rain-alert';
            else if (isHighTemp) alertClass = 'temp-alert';

            hourlyItems.push(`
                <div class="hourly-item ${alertClass}">
                    <div class="hourly-time">${time.getHours()}h</div>
                    <div class="hourly-icon">${getWeatherEmoji(code)}</div>
                    <div class="hourly-temp">${Math.round(temp)}°C</div>
                </div>
            `);
        }
    }

    elements.hourlyList.innerHTML = hourlyItems.join('');
    elements.weatherSection.classList.remove('hidden');
}

async function checkWeatherAlerts(data, cityName) {
    const hourly = data.hourly;
    const currentHour = new Date().getHours();
    
    let rainAlert = false;
    let tempAlert = false;
    let rainHour = null;
    let highTemp = null;

    for (let i = 1; i <= 4; i++) {
        const hourIndex = currentHour + i;
        if (hourIndex < hourly.time.length) {
            const code = hourly.weather_code[hourIndex];
            const temp = hourly.temperature_2m[hourIndex];
            
            if (!rainAlert && CONFIG.RAIN_CODES.includes(code)) {
                rainAlert = true;
                rainHour = i;
            }
            
            if (!tempAlert && temp > CONFIG.TEMP_THRESHOLD) {
                tempAlert = true;
                highTemp = Math.round(temp);
            }
        }
    }

    // ✅ Envoyer les notifications avec await
    if (rainAlert) {
        await sendWeatherNotification(
            cityName,
            `Pluie prévue dans ${rainHour} heure${rainHour > 1 ? 's' : ''} !`,
            'rain'
        );
    }

    if (tempAlert) {
        await sendWeatherNotification(
            cityName,
            `Température supérieure à ${CONFIG.TEMP_THRESHOLD}°C prévue (${highTemp}°C)`,
            'temp'
        );
    }
}

// ===== Utilitaires =====
function getWeatherEmoji(code) {
    const weatherEmojis = {
        0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
        45: '🌫️', 48: '🌫️',
        51: '🌦️', 53: '🌦️', 55: '🌧️', 56: '🌨️', 57: '🌨️',
        61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌨️', 67: '🌨️',
        71: '🌨️', 73: '🌨️', 75: '❄️', 77: '🌨️',
        80: '🌦️', 81: '🌧️', 82: '⛈️',
        85: '🌨️', 86: '❄️',
        95: '⛈️', 96: '⛈️', 99: '⛈️'
    };
    return weatherEmojis[code] || '🌤️';
}

function showLoading() {
    elements.loading.classList.remove('hidden');
    elements.weatherSection.classList.add('hidden');
}

function hideLoading() {
    elements.loading.classList.add('hidden');
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.classList.remove('hidden');
}

function hideError() {
    elements.errorMessage.classList.add('hidden');
}