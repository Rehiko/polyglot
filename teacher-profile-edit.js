const pageMessage = document.getElementById("pageMessage");
const profileForm = document.getElementById("teacherProfileForm");
const formMessage = document.getElementById("formMessage");
const avatarInput = document.getElementById("avatarFile");
const avatarPreview = document.getElementById("avatarPreview");
const avatarPlaceholder = document.getElementById("avatarPlaceholder");

const supabaseUrl = window.POLYGLOT_SUPABASE_URL;
const supabaseKey = window.POLYGLOT_SUPABASE_KEY;
const configIsReady = Boolean(
    supabaseUrl && supabaseKey &&
    !supabaseUrl.includes("YOUR_SUPABASE") &&
    !supabaseKey.includes("YOUR_SUPABASE")
);

let currentUser = null;
let currentAvatarUrl = "";
let pendingAvatarFile = null;
let previewObjectUrl = "";

function showMessage(element, text, type = "error") {
    element.textContent = text;
    element.className = `notice ${type}`;
    element.hidden = false;
}

function clearMessage(element) {
    element.textContent = "";
    element.hidden = true;
}

function setFieldError(id, text = "") {
    const input = document.getElementById(id);
    const error = document.querySelector(`[data-error-for="${id}"]`);
    if (input) input.classList.toggle("invalid", Boolean(text));
    if (error) error.textContent = text;
}

function normalizedList(value) {
    return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function selectedLevels() {
    return [...document.querySelectorAll("input[name='studentLevel']:checked")]
        .map((input) => input.value);
}

function showAvatar(url, name) {
    avatarPlaceholder.textContent = (name || "T").trim().charAt(0).toUpperCase();
    if (url) {
        avatarPreview.src = url;
        avatarPreview.hidden = false;
        avatarPlaceholder.hidden = true;
    } else {
        avatarPreview.hidden = true;
        avatarPlaceholder.hidden = false;
    }
}

function updateCounter(inputId, outputId) {
    document.getElementById(outputId).textContent = document.getElementById(inputId).value.length;
}

[["headline", "headlineCount"], ["bio", "bioCount"], ["teachingMethods", "methodsCount"]]
    .forEach(([inputId, outputId]) => {
        document.getElementById(inputId).addEventListener("input", () => updateCounter(inputId, outputId));
    });

avatarInput.addEventListener("change", () => {
    const file = avatarInput.files[0];
    clearMessage(formMessage);
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
        avatarInput.value = "";
        showMessage(formMessage, "Choose a JPG, PNG or WebP image.");
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        avatarInput.value = "";
        showMessage(formMessage, "The image must be smaller than 5 MB.");
        return;
    }

    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(file);
    pendingAvatarFile = file;
    document.getElementById("selectedFileName").textContent = file.name;
    showAvatar(previewObjectUrl, document.getElementById("fullName").value);
});

if (!configIsReady) {
    showMessage(pageMessage, "Add your Supabase URL and publishable key to supabase-config.js.");
} else {
    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

    async function loadProfile() {
        const { data: userData, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !userData.user) {
            window.location.replace("login.html#login");
            return;
        }
        currentUser = userData.user;

        const { data: profile, error: profileError } = await supabaseClient
            .from("profiles").select("full_name, role, avatar_url")
            .eq("id", currentUser.id).single();

        if (profileError || !profile) {
            showMessage(pageMessage, "Profile could not be loaded. Run the newest supabase-setup.sql file.");
            return;
        }
        if (profile.role !== "teacher") {
            window.location.replace("student-dashboard.html");
            return;
        }

        const { data: teacherProfile, error: teacherError } = await supabaseClient
            .from("teacher_profiles")
            .select("headline, bio, languages, native_language, student_levels, teaching_methods, experience_years, lesson_duration_minutes")
            .eq("user_id", currentUser.id).single();

        if (teacherError || !teacherProfile) {
            showMessage(pageMessage, "Teacher profile could not be loaded. Run the newest supabase-setup.sql file.");
            return;
        }

        currentAvatarUrl = profile.avatar_url || "";
        document.getElementById("fullName").value = profile.full_name || "";
        document.getElementById("headline").value = teacherProfile.headline || "";
        document.getElementById("languages").value = (teacherProfile.languages || []).join(", ");
        document.getElementById("nativeLanguage").value = teacherProfile.native_language || "";
        document.getElementById("experienceYears").value = teacherProfile.experience_years ?? "";
        document.getElementById("lessonDuration").value = String(teacherProfile.lesson_duration_minutes || 60);
        document.getElementById("bio").value = teacherProfile.bio || "";
        document.getElementById("teachingMethods").value = teacherProfile.teaching_methods || "";

        const savedLevels = new Set(teacherProfile.student_levels || []);
        document.querySelectorAll("input[name='studentLevel']").forEach((input) => {
            input.checked = savedLevels.has(input.value);
        });

        showAvatar(currentAvatarUrl, profile.full_name);
        updateCounter("headline", "headlineCount");
        updateCounter("bio", "bioCount");
        updateCounter("teachingMethods", "methodsCount");
        pageMessage.hidden = true;
        profileForm.hidden = false;
    }

    async function uploadAvatar() {
        if (!pendingAvatarFile) return currentAvatarUrl;
        const filePath = `${currentUser.id}/avatar`;
        const { error } = await supabaseClient.storage
            .from("teacher-avatars")
            .upload(filePath, pendingAvatarFile, {
                upsert: true,
                cacheControl: "3600",
                contentType: pendingAvatarFile.type
            });
        if (error) throw error;

        const { data } = supabaseClient.storage.from("teacher-avatars").getPublicUrl(filePath);
        return `${data.publicUrl}?v=${Date.now()}`;
    }

    profileForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearMessage(formMessage);

        const fullName = document.getElementById("fullName").value.trim();
        const headline = document.getElementById("headline").value.trim();
        const languages = normalizedList(document.getElementById("languages").value);
        const nativeLanguage = document.getElementById("nativeLanguage").value.trim();
        const experienceYears = Number(document.getElementById("experienceYears").value);
        const lessonDuration = Number(document.getElementById("lessonDuration").value);
        const levels = selectedLevels();
        const bio = document.getElementById("bio").value.trim();
        const teachingMethods = document.getElementById("teachingMethods").value.trim();
        const saveButton = document.getElementById("saveProfileButton");

        ["fullName", "headline", "languages", "nativeLanguage", "experienceYears", "studentLevels", "bio", "teachingMethods"]
            .forEach((id) => setFieldError(id));

        let valid = true;
        if (fullName.length < 2) { setFieldError("fullName", "Enter your full name."); valid = false; }
        if (headline.length < 10) { setFieldError("headline", "Write at least 10 characters."); valid = false; }
        if (!languages.length) { setFieldError("languages", "Add at least one teaching language."); valid = false; }
        if (!nativeLanguage) { setFieldError("nativeLanguage", "Enter your native language."); valid = false; }
        if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 80) {
            setFieldError("experienceYears", "Enter a valid number of years."); valid = false;
        }
        if (!levels.length) { setFieldError("studentLevels", "Select at least one student level."); valid = false; }
        if (bio.length < 30) { setFieldError("bio", "Write at least 30 characters."); valid = false; }
        if (teachingMethods.length < 20) { setFieldError("teachingMethods", "Write at least 20 characters."); valid = false; }

        if (!valid) {
            showMessage(formMessage, "Check the highlighted fields and try again.");
            return;
        }

        saveButton.disabled = true;
        saveButton.querySelector("span:first-child").textContent = "Saving...";

        try {
            const avatarUrl = await uploadAvatar();
            const { error: profileError } = await supabaseClient
                .from("profiles").update({ full_name: fullName, avatar_url: avatarUrl || null })
                .eq("id", currentUser.id);
            if (profileError) throw profileError;

            const { error: teacherError } = await supabaseClient
                .from("teacher_profiles")
                .update({
                    headline,
                    languages,
                    native_language: nativeLanguage,
                    experience_years: experienceYears,
                    lesson_duration_minutes: lessonDuration,
                    student_levels: levels,
                    bio,
                    teaching_methods: teachingMethods
                })
                .eq("user_id", currentUser.id);
            if (teacherError) throw teacherError;

            currentAvatarUrl = avatarUrl;
            pendingAvatarFile = null;
            document.getElementById("selectedFileName").textContent = "";
            showAvatar(currentAvatarUrl, fullName);
            showMessage(formMessage, "Profile saved. Opening your weekly schedule...", "success");
            setTimeout(() => {
                window.location.href = "teacher-dashboard.html#availability";
            }, 700);
        } catch (error) {
            showMessage(formMessage, error.message || "The profile could not be saved.");
        } finally {
            saveButton.disabled = false;
            saveButton.querySelector("span:first-child").textContent = "Save profile";
        }
    });

    document.getElementById("logoutButton").addEventListener("click", async () => {
        await supabaseClient.auth.signOut();
        window.location.replace("login.html#login");
    });

    loadProfile();
}
