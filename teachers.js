const teachersGrid = document.getElementById("teachersGrid");
const teachersMessage = document.getElementById("teachersMessage");
const searchInput = document.getElementById("teacherSearch");
const languageFilter = document.getElementById("languageFilter");

const supabaseUrl = window.POLYGLOT_SUPABASE_URL;
const supabaseKey = window.POLYGLOT_SUPABASE_KEY;
const configIsReady = Boolean(
    supabaseUrl && supabaseKey &&
    !supabaseUrl.includes("YOUR_SUPABASE") &&
    !supabaseKey.includes("YOUR_SUPABASE")
);

let allTeachers = [];

function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase()).join("") || "T";
}

function addText(parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
}

function createTeacherCard(teacher) {
    const profile = teacher.profiles;
    const card = document.createElement("article");
    card.className = "directory-teacher-card";

    const photoWrap = document.createElement("div");
    photoWrap.className = "directory-teacher-photo";
    if (profile.avatar_url) {
        const image = document.createElement("img");
        image.src = profile.avatar_url;
        image.alt = `${profile.full_name} profile`;
        image.loading = "lazy";
        photoWrap.appendChild(image);
    } else {
        addText(photoWrap, "span", "teacher-initials", initials(profile.full_name));
    }
    addText(photoWrap, "span", "approved-mark", "✓ Approved");
    card.appendChild(photoWrap);

    const content = document.createElement("div");
    content.className = "directory-teacher-content";
    addText(content, "h2", "", profile.full_name);
    addText(content, "p", "teacher-headline", teacher.headline || "Polyglot language teacher");

    const chips = document.createElement("div");
    chips.className = "teacher-language-chips";
    (teacher.languages || []).slice(0, 3).forEach((language) => addText(chips, "span", "", language));
    content.appendChild(chips);

    const facts = document.createElement("div");
    facts.className = "teacher-card-facts";
    addText(facts, "span", "", `${teacher.experience_years ?? 0} years experience`);
    addText(facts, "span", "", `${teacher.lesson_duration_minutes || 60} min lessons`);
    content.appendChild(facts);

    const link = document.createElement("a");
    link.className = "teacher-profile-link";
    link.href = `teacher-profile.html?id=${encodeURIComponent(teacher.user_id)}`;
    link.append("View profile ");
    addText(link, "span", "", "→");
    content.appendChild(link);
    card.appendChild(content);
    return card;
}

function renderTeachers(teachers) {
    teachersGrid.replaceChildren();
    if (!teachers.length) {
        teachersMessage.textContent = "No approved teachers match your search yet.";
        teachersMessage.hidden = false;
        return;
    }
    teachersMessage.hidden = true;
    teachers.forEach((teacher) => teachersGrid.appendChild(createTeacherCard(teacher)));
}

function applyFilters() {
    const search = searchInput.value.trim().toLowerCase();
    const language = languageFilter.value.toLowerCase();
    const filtered = allTeachers.filter((teacher) => {
        const languages = teacher.languages || [];
        const searchable = [teacher.profiles.full_name, teacher.headline, ...languages]
            .filter(Boolean).join(" ").toLowerCase();
        return (!search || searchable.includes(search)) &&
            (!language || languages.some((item) => item.toLowerCase() === language));
    });
    renderTeachers(filtered);
}

async function loadTeachers() {
    if (!configIsReady) {
        teachersMessage.textContent = "Add your Supabase URL and publishable key to supabase-config.js.";
        return;
    }

    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabaseClient
        .from("teacher_profiles")
        .select("user_id, headline, languages, experience_years, lesson_duration_minutes, profiles!inner(full_name, avatar_url)")
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false });

    if (error) {
        teachersMessage.textContent = `Teachers could not be loaded: ${error.message}`;
        return;
    }

    allTeachers = data || [];
    const languages = [...new Set(allTeachers.flatMap((teacher) => teacher.languages || []))]
        .sort((a, b) => a.localeCompare(b));
    languages.forEach((language) => {
        const option = document.createElement("option");
        option.value = language;
        option.textContent = language;
        languageFilter.appendChild(option);
    });
    renderTeachers(allTeachers);
}

searchInput.addEventListener("input", applyFilters);
languageFilter.addEventListener("change", applyFilters);
loadTeachers();
