(function () {
    'use strict';
    const translations = {
        en: {},
        uk: {skip:'Перейти до вмісту',teachers:'Викладачі',courses:'Курси',materials:'Матеріали',login:'Увійти',signup:'Реєстрація',eyebrow:'МАЛЕНЬКІ КРОКИ. СПРАВЖНІ РОЗМОВИ.',titleStart:'Нова мова.',titleMiddle:'Світ нових',titleEnd:'можливостей.',description:'Знайди свого викладача. Відчуй упевненість. Спілкуйся по-своєму.',create:'Створити акаунт',member:'Уже маєш акаунт?',worldLabel:'Трохи практики. Більше світу.',worldCaption:'Різні мови. Справжні зв’язки.',conversation:'Навчайся через справжні розмови',benefitOne:'Індивідуальні уроки',benefitTwo:'Гнучкий розклад',benefitThree:'Особистий підхід',explore:'ТВОЯ НОВА ІСТОРІЯ',popular:'Куди приведе тебе нова мова?',spanish:'Іспанська',english:'Англійська',japanese:'Японська',spanishText:'Від перших слів до справжніх розмов.',englishText:'Для роботи, подорожей і щоденного життя.',japaneseText:'Відкрий мову. Познайомся з культурою.',people:'СПРАВЖНІ ЛЮДИ. ОСОБИСТИЙ ПІДХІД.',featured:'Знайди свого викладача',viewAll:'Усі викладачі',loadingTeachers:'Шукаємо твого наступного викладача…',emptyTeachers:'Схвалені викладачі незабаром з’являться тут.',errorTeachers:'Не вдалося завантажити викладачів. Спробуй оновити сторінку.',profile:'Переглянути профіль',ready:'ПОЧНИ, КОЛИ БУДЕШ ГОТОВИЙ',closing:'Твоя перша розмова починається тут.',getStarted:'Зареєструватися',terms:'Умови',privacy:'Конфіденційність',refunds:'Повернення коштів',cancellations:'Скасування',contact:'Контакти',footerText:'Світ мов. Місце для тебе.'},
        es: {skip:'Ir al contenido',teachers:'Profesores',courses:'Cursos',materials:'Materiales',login:'Entrar',signup:'Regístrate',eyebrow:'PEQUEÑOS PASOS. CONVERSACIONES REALES.',titleStart:'Un nuevo idioma.',titleMiddle:'Un mundo de',titleEnd:'posibilidades.',description:'Encuentra a tu profesor. Gana confianza. Habla a tu manera.',create:'Crear una cuenta',member:'¿Ya tienes una cuenta?',worldLabel:'Un poco de práctica. Un mundo más grande.',worldCaption:'Diferentes idiomas. Conexiones reales.',conversation:'Aprende con conversaciones reales',benefitOne:'Clases individuales',benefitTwo:'Horarios flexibles',benefitThree:'Aprendizaje personal',explore:'TU PRÓXIMO CAPÍTULO',popular:'¿Adónde te llevará tu próximo idioma?',spanish:'Español',english:'Inglés',japanese:'Japonés',spanishText:'De tus primeras palabras a conversaciones reales.',englishText:'Para el trabajo, los viajes y la vida diaria.',japaneseText:'Descubre un idioma. Conecta con una cultura.',people:'PERSONAS REALES. APRENDIZAJE PERSONAL.',featured:'Conoce a tu próximo profesor',viewAll:'Ver todos los profesores',loadingTeachers:'Buscando a tu próximo profesor…',emptyTeachers:'Los profesores aprobados aparecerán aquí pronto.',errorTeachers:'No se pudieron cargar los profesores. Intenta actualizar la página.',profile:'Ver perfil',ready:'CUANDO TÚ QUIERAS',closing:'Tu primera conversación empieza aquí.',getStarted:'Regístrate para empezar',terms:'Términos',privacy:'Privacidad',refunds:'Reembolsos',cancellations:'Cancelaciones',contact:'Contacto',footerText:'Un mundo de idiomas. Un lugar para ti.'},
        ja: {skip:'本文へ移動',teachers:'講師',courses:'コース',materials:'教材',login:'ログイン',signup:'新規登録',eyebrow:'小さな一歩から、本物の会話へ。',titleStart:'新しい言語。',titleMiddle:'広がる',titleEnd:'可能性。',description:'自分に合う先生を見つけて、自信をつけよう。あなたらしく話そう。',create:'アカウントを作成',member:'すでに登録済みですか？',worldLabel:'少しの練習で、世界が広がる。',worldCaption:'違う言語。本物のつながり。',conversation:'本物の会話を通して学ぶ',benefitOne:'マンツーマン',benefitTwo:'柔軟なスケジュール',benefitThree:'自分に合った学習',explore:'あなたの次の一歩',popular:'新しい言語で、どこへ行こう？',spanish:'スペイン語',english:'英語',japanese:'日本語',spanishText:'最初のひと言から、本物の会話へ。',englishText:'仕事、旅行、そして毎日のために。',japaneseText:'言葉を学び、文化とつながる。',people:'一人ひとりに合った学習。',featured:'あなたに合う先生を見つけよう',viewAll:'すべての講師を見る',loadingTeachers:'講師を読み込んでいます…',emptyTeachers:'承認された講師がここに表示されます。',errorTeachers:'講師を読み込めませんでした。再読み込みしてください。',profile:'プロフィールを見る',ready:'いつでも始められます',closing:'最初の会話は、ここから。',getStarted:'登録して始めよう',terms:'利用規約',privacy:'プライバシー',refunds:'返金',cancellations:'キャンセル',contact:'お問い合わせ',footerText:'言語の世界。あなたの居場所。'}
    };
    document.querySelectorAll('[data-i18n]').forEach(el => { translations.en[el.dataset.i18n] = el.textContent; });
    Object.assign(translations.en,{profile:'View profile',emptyTeachers:'Approved teachers will appear here soon.',errorTeachers:'Teachers could not be loaded. Please try refreshing the page.'});
    let language = 'en';
    const button = document.getElementById('langBtn');
    const menu = document.getElementById('langMenu');
    function closeMenu() { menu.hidden = true; button.setAttribute('aria-expanded','false'); }
    window.updateContent = function () {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const value = translations[language][el.dataset.i18n] || translations.en[el.dataset.i18n];
            if (value) el.textContent = value;
        });
        document.documentElement.lang = language;
        document.getElementById('currentLanguage').textContent = language.toUpperCase();
    };
    button.addEventListener('click', () => { menu.hidden = !menu.hidden; button.setAttribute('aria-expanded',String(!menu.hidden)); });
    menu.querySelectorAll('[data-language]').forEach(el => el.addEventListener('click', () => {
        language = el.dataset.language;
        try { localStorage.setItem('language',language); } catch (_) {}
        window.updateContent(); closeMenu(); button.focus();
    }));
    document.addEventListener('click', event => { if (!event.target.closest('.language-switcher')) closeMenu(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { closeMenu(); button.focus(); } });
    try { const saved = localStorage.getItem('language'); if (translations[saved]) language = saved; } catch (_) {}
    window.updateContent();
})();
