const langBtn = document.getElementById("langBtn");

const langMenu = document.getElementById("langMenu");



langBtn.addEventListener("click",()=>{

langMenu.classList.toggle("active");

});





i18next.init({

lng:"en",


resources:{



en:{


translation:{


titleLearn:"Learn",
titleRest:"languages anywhere.",

description:
"Choose your teacher, book lessons and access learning materials.",

button:"Find Teacher",


teachers:"Teachers",

courses:"Courses",

materials:"Personalized Materials",

login:"Login",


popular:"Popular Languages",

featured:"Featured Teachers",


englishTeacher:"English Teacher",

spanishTeacher:"Spanish Teacher",

japaneseTeacher:"Japanese Teacher",


profile:"View Profile"


}


},






uk:{


translation:{


titleLearn:"Вивчайте",
titleRest:"мови будь-де.",

description:
"Оберіть викладача, забронюйте уроки та отримайте навчальні матеріали.",

button:"Знайти викладача",


teachers:"Викладачі",

courses:"Курси",

materials:"Персоналізовані матеріали",

login:"Вхід",


popular:"Популярні мови",

featured:"Популярні викладачі",


englishTeacher:"Викладач англійської",

spanishTeacher:"Викладач іспанської",

japaneseTeacher:"Викладач японської",


profile:"Переглянути профіль"


}


},






es:{


translation:{


titleLearn:"Aprende",
titleRest:"idiomas en cualquier lugar.",

description:
"Elige un profesor, reserva clases y accede a materiales de aprendizaje.",

button:"Buscar profesor",


teachers:"Profesores",

courses:"Cursos",

materials:"Materiales personalizados",

login:"Iniciar sesión",


popular:"Idiomas populares",

featured:"Profesores destacados",


englishTeacher:"Profesor de inglés",

spanishTeacher:"Profesor de español",

japaneseTeacher:"Profesor de japonés",


profile:"Ver perfil"


}


},






ja:{


translation:{


titleLearn:"学ぼう",
titleRest:"どこでも語学を。",

description:
"先生を選び、レッスンを予約して学習教材にアクセスできます。",

button:"先生を探す",


teachers:"先生",

courses:"コース",

materials:"学習教材",

login:"ログイン",


popular:"人気の言語",

featured:"おすすめの先生",


englishTeacher:"英語教師",

spanishTeacher:"スペイン語教師",

japaneseTeacher:"日本語教師",


profile:"プロフィールを見る"


}


}



}



},()=>{


loadLanguage();


});






function updateContent(){


document.querySelectorAll("[data-i18n]")

.forEach(element=>{


element.innerHTML = 
i18next.t(element.dataset.i18n);


});


}





function changeLanguage(lang){


i18next.changeLanguage(lang,()=>{


localStorage.setItem("language",lang);


updateContent();


});


langMenu.classList.remove("active");


}





function loadLanguage(){


let savedLang = localStorage.getItem("language");



if(savedLang){


i18next.changeLanguage(savedLang,()=>{


updateContent();


});


}

else{


updateContent();


}



}