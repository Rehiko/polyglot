(function () {
    "use strict";

    const teachersGrid = document.getElementById("featuredTeacherGrid");
    const teachersMessage = document.getElementById("featuredTeachersMessage");

    if (!teachersGrid || !teachersMessage) return;

    const supabaseUrl = window.POLYGLOT_SUPABASE_URL;
    const supabaseKey = window.POLYGLOT_SUPABASE_KEY;
    const configIsReady = Boolean(
        supabaseUrl &&
        supabaseKey &&
        !supabaseUrl.includes("YOUR_SUPABASE") &&
        !supabaseKey.includes("YOUR_SUPABASE")
    );

    function getInitials(name) {
        return (name || "Teacher")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("") || "T";
    }

    function addText(parent, tag, className, value) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = value;
        parent.appendChild(element);
        return element;
    }

    function createTeacherCard(teacher) {
        const profile = Array.isArray(teacher.profiles)
            ? teacher.profiles[0]
            : teacher.profiles;
        const fullName = profile?.full_name || "Polyglot Teacher";

        const card = document.createElement("article");
        card.className = "teacher featured-teacher-card";

        const photo = document.createElement("div");
        photo.className = "featured-teacher-photo";

        if (profile?.avatar_url) {
            const image = document.createElement("img");
            image.src = profile.avatar_url;
            image.alt = `${fullName} profile`;
            image.loading = "lazy";
            photo.appendChild(image);
        } else {
            addText(photo, "span", "featured-teacher-initials", getInitials(fullName));
        }

        addText(photo, "span", "featured-approved-badge", "✓ Approved");
        card.appendChild(photo);

        const content = document.createElement("div");
        content.className = "featured-teacher-content";
        addText(content, "h3", "", fullName);
        addText(
            content,
            "p",
            "featured-teacher-headline",
            teacher.headline || "Polyglot language teacher"
        );

        const languages = document.createElement("div");
        languages.className = "featured-language-chips";
        (teacher.languages || []).slice(0, 3).forEach((language) => {
            addText(languages, "span", "", language);
        });
        content.appendChild(languages);

        const facts = document.createElement("div");
        facts.className = "featured-teacher-facts";
        const years = Number(teacher.experience_years) || 0;
        addText(facts, "span", "", `${years} years experience`);
        addText(
            facts,
            "span",
            "",
            `${teacher.lesson_duration_minutes || 60} min lessons`
        );
        content.appendChild(facts);

        const profileLink = document.createElement("a");
        profileLink.className = "featured-profile-link";
        profileLink.href = `teacher-profile.html?id=${encodeURIComponent(teacher.user_id)}`;
        profileLink.dataset.i18n = "profile";
        profileLink.textContent = "View Profile";
        content.appendChild(profileLink);

        card.appendChild(content);
        return card;
    }

    function renderTeachers(teachers) {
        teachersGrid.replaceChildren();

        if (!teachers.length) {
            teachersMessage.textContent = "Approved teachers will appear here soon.";
            teachersMessage.hidden = false;
            return;
        }

        teachersMessage.hidden = true;
        teachers.forEach((teacher) => {
            teachersGrid.appendChild(createTeacherCard(teacher));
        });

        if (typeof window.updateContent === "function") {
            window.updateContent();
        }
    }

    async function loadFeaturedTeachers() {
        if (!configIsReady || !window.supabase) {
            teachersMessage.textContent =
                "Add the Supabase URL and publishable key to supabase-config.js.";
            return;
        }

        const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        const { data, error } = await supabaseClient
            .from("teacher_profiles")
            .select(
                "user_id, headline, languages, experience_years, lesson_duration_minutes, profiles!inner(full_name, avatar_url)"
            )
            .eq("approval_status", "approved")
            .order("created_at", { ascending: false })
            .limit(3);

        if (error) {
            console.error("Featured teachers could not be loaded:", error);
            teachersMessage.textContent = "Teachers could not be loaded right now.";
            return;
        }

        renderTeachers(data || []);
    }

    loadFeaturedTeachers();
})();
