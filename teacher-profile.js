(function () {
    "use strict";

    const profileMessage = document.getElementById("profileMessage");
    const publicProfile = document.getElementById("publicTeacherProfile");
    const availabilityList = document.getElementById("availabilityList");
    const bookingMessage = document.getElementById("bookingMessage");
    const accountStatus = document.getElementById("bookingAccountStatus");
    const buyLessonsLink = document.getElementById("buyLessonsLink");
    const weekLabel = document.getElementById("bookingWeekLabel");
    const previousWeekButton = document.getElementById("previousWeekButton");
    const nextWeekButton = document.getElementById("nextWeekButton");
    const teacherId = new URLSearchParams(window.location.search).get("id");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    document.getElementById("bookingTimezone").textContent = timezone;

    const supabaseUrl = window.POLYGLOT_SUPABASE_URL;
    const supabaseKey = window.POLYGLOT_SUPABASE_KEY;
    const configIsReady = Boolean(
        supabaseUrl && supabaseKey &&
        !supabaseUrl.includes("YOUR_SUPABASE") &&
        !supabaseKey.includes("YOUR_SUPABASE") &&
        window.supabase
    );

    let client = null;
    let viewer = {
        user: null,
        role: null,
        freeTrialAvailable: false,
        paidLessons: 0
    };

    function startOfWeek(value) {
        const date = new Date(value);
        date.setHours(0, 0, 0, 0);
        const weekday = date.getDay();
        date.setDate(date.getDate() + (weekday === 0 ? -6 : 1 - weekday));
        return date;
    }

    function addDays(value, amount) {
        const date = new Date(value);
        date.setDate(date.getDate() + amount);
        return date;
    }

    function localDateKey(value) {
        const date = new Date(value);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    const firstWeekStart = startOfWeek(new Date());
    const lastWeekStart = addDays(firstWeekStart, 77);
    let currentWeekStart = new Date(firstWeekStart);

    function initials(name) {
        return (name || "Teacher").split(/\s+/).filter(Boolean).slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase()).join("") || "T";
    }

    function addChip(parent, text) {
        const chip = document.createElement("span");
        chip.textContent = text;
        parent.appendChild(chip);
    }

    function showBookingMessage(text, type = "error") {
        bookingMessage.textContent = text;
        bookingMessage.className = `notice ${type}`;
        bookingMessage.hidden = false;
    }

    function formatTime(value) {
        return new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value));
    }

    function formatWeekRange() {
        const end = addDays(currentWeekStart, 6);
        const startText = new Intl.DateTimeFormat(undefined, {
            day: "numeric",
            month: "short"
        }).format(currentWeekStart);
        const endText = new Intl.DateTimeFormat(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric"
        }).format(end);
        return `${startText} – ${endText}`;
    }

    function delay(milliseconds) {
        return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    }

    function showBookingSuccess(text, meetingUrl = null) {
        bookingMessage.replaceChildren();
        bookingMessage.className = "notice success";
        bookingMessage.hidden = false;

        const messageText = document.createElement("span");
        messageText.textContent = text;
        bookingMessage.appendChild(messageText);

        if (
            typeof meetingUrl === "string" &&
            meetingUrl.startsWith("https://meet.google.com/")
        ) {
            const separator = document.createTextNode(" ");
            const meetingLink = document.createElement("a");
            meetingLink.href = meetingUrl;
            meetingLink.target = "_blank";
            meetingLink.rel = "noopener noreferrer";
            meetingLink.textContent = "Open Google Meet →";
            bookingMessage.append(separator, meetingLink);
        }
    }

    async function findBookingForSlot(slotId) {
        const { data, error } = await client
            .from("lesson_bookings")
            .select("id")
            .eq("slot_id", slotId)
            .eq("student_id", viewer.user.id)
            .eq("status", "scheduled")
            .maybeSingle();

        if (error || !data?.id) {
            return null;
        }

        return data.id;
    }

    async function createGoogleMeet(bookingId) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const { data, error } = await client.functions.invoke(
                "create-google-meet",
                {
                    body: {
                        booking_id: bookingId
                    }
                }
            );

            if (
                !error &&
                typeof data?.meeting_url === "string" &&
                data.meeting_url.startsWith("https://meet.google.com/")
            ) {
                return data.meeting_url;
            }

            if (attempt === 0) {
                await delay(2000);
            }
        }

        return null;
    }

    function updateAccountStatus() {
        buyLessonsLink.hidden = true;
        if (!viewer.user) {
            accountStatus.textContent = "Log in as a student to use your free lesson.";
        } else if (viewer.role !== "student") {
            accountStatus.textContent = "Lesson booking is available to student accounts.";
        } else if (viewer.freeTrialAvailable) {
            accountStatus.textContent = "Your free trial lesson is available.";
        } else if (viewer.paidLessons > 0) {
            accountStatus.textContent = `${viewer.paidLessons} paid lessons available`;
        } else {
            accountStatus.textContent = "Your lesson balance is empty.";
            buyLessonsLink.hidden = false;
        }
    }

    async function loadViewer() {
        const { data: userData } = await client.auth.getUser();
        if (!userData.user) {
            updateAccountStatus();
            return;
        }

        viewer.user = userData.user;
        const { data: profile } = await client
            .from("profiles")
            .select("role")
            .eq("id", viewer.user.id)
            .single();

        viewer.role = profile?.role || null;
        if (viewer.role === "student") {
            const { data: balance } = await client
                .from("student_lesson_balances")
                .select("paid_lessons, free_trial_used_at")
                .eq("student_id", viewer.user.id)
                .maybeSingle();

            viewer.paidLessons = balance?.paid_lessons || 0;
            viewer.freeTrialAvailable = !balance?.free_trial_used_at;
        }
        updateAccountStatus();
    }

    async function bookSlot(slot, button) {
        if (!viewer.user) {
            sessionStorage.setItem("polyglotReturnAfterLogin", window.location.href);
            window.location.href = "login.html#login";
            return;
        }

        const hasLessonCredit = viewer.freeTrialAvailable || viewer.paidLessons > 0;
        if (viewer.role !== "student" || !hasLessonCredit) return;

        const usedFreeTrial = viewer.freeTrialAvailable;
        button.disabled = true;
        button.textContent = "Booking...";
        bookingMessage.hidden = true;

        const { error } = await client.rpc("book_lesson", {
            p_slot_id: slot.id
        });

        if (error) {
            showBookingMessage(error.message);
            button.disabled = false;
            button.textContent = `${formatTime(slot.starts_at)}–${formatTime(slot.ends_at)}`;
            return;
        }

        if (usedFreeTrial) {
            viewer.freeTrialAvailable = false;
        } else {
            viewer.paidLessons = Math.max(0, viewer.paidLessons - 1);
        }
        updateAccountStatus();
        const lessonDate = new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long"
        }).format(new Date(slot.starts_at));

        button.textContent = "Creating Google Meet...";

        const bookingId = await findBookingForSlot(slot.id);
        const meetingUrl = bookingId
            ? await createGoogleMeet(bookingId)
            : null;

        if (meetingUrl) {
            showBookingSuccess(
                `Lesson booked for ${lessonDate} at ${formatTime(slot.starts_at)}. The Google Meet invitation has been emailed to you and your teacher.`,
                meetingUrl
            );
        } else {
            showBookingMessage(
                `Lesson booked for ${lessonDate} at ${formatTime(slot.starts_at)}. Google Meet is still being prepared; the lesson remains confirmed.`,
                "warning"
            );
        }

        await loadWeekAvailability();
    }

    function createTimeButton(slot) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-time-button";
        button.textContent = `${formatTime(slot.starts_at)}–${formatTime(slot.ends_at)}`;

        if (viewer.user && viewer.role !== "student") {
            button.disabled = true;
            button.title = "Use a student account to book lessons.";
        } else if (viewer.user && !viewer.freeTrialAvailable && viewer.paidLessons < 1) {
            button.disabled = true;
            button.title = "Buy a lesson package to book this time.";
        }

        button.addEventListener("click", () => bookSlot(slot, button));
        return button;
    }

    function renderWeek(slots) {
        availabilityList.replaceChildren();
        weekLabel.textContent = formatWeekRange();
        previousWeekButton.disabled = currentWeekStart <= firstWeekStart;
        nextWeekButton.disabled = currentWeekStart >= lastWeekStart;

        const slotsByDay = new Map();
        (slots || []).forEach((slot) => {
            const key = localDateKey(slot.starts_at);
            if (!slotsByDay.has(key)) slotsByDay.set(key, []);
            slotsByDay.get(key).push(slot);
        });

        dayNames.forEach((dayName, index) => {
            const date = addDays(currentWeekStart, index);
            const card = document.createElement("article");
            card.className = "booking-day-card";

            const header = document.createElement("header");
            const day = document.createElement("strong");
            const dateText = document.createElement("span");
            day.textContent = dayName;
            dateText.textContent = new Intl.DateTimeFormat(undefined, {
                day: "numeric",
                month: "short"
            }).format(date);
            header.append(day, dateText);

            const times = document.createElement("div");
            times.className = "booking-day-times";
            const daySlots = slotsByDay.get(localDateKey(date)) || [];

            if (!daySlots.length) {
                const empty = document.createElement("span");
                empty.className = "no-day-times";
                empty.textContent = "No times";
                times.appendChild(empty);
            } else {
                daySlots.forEach((slot) => times.appendChild(createTimeButton(slot)));
            }

            card.append(header, times);
            availabilityList.appendChild(card);
        });
    }

    async function loadWeekAvailability() {
        availabilityList.classList.add("loading-calendar");
        const weekEnd = addDays(currentWeekStart, 7);

        const { data, error } = await client
            .from("teacher_availability")
            .select("id, starts_at, ends_at")
            .eq("teacher_id", teacherId)
            .eq("status", "available")
            .gte("starts_at", currentWeekStart.toISOString())
            .lt("starts_at", weekEnd.toISOString())
            .order("starts_at", { ascending: true });

        availabilityList.classList.remove("loading-calendar");
        if (error) {
            showBookingMessage("Available times could not be loaded. Run the newest database update.");
            renderWeek([]);
            return;
        }

        renderWeek(data || []);
    }

    async function initializeBookingCalendar() {
        await loadViewer();
        const { error } = await client.rpc("refresh_teacher_availability", {
            p_teacher_id: teacherId
        });

        if (error) {
            showBookingMessage("The weekly schedule could not be prepared. Run the newest supabase-setup.sql file.");
        }
        await loadWeekAvailability();
    }

    previousWeekButton.addEventListener("click", async () => {
        if (currentWeekStart <= firstWeekStart) return;
        currentWeekStart = addDays(currentWeekStart, -7);
        await loadWeekAvailability();
    });

    nextWeekButton.addEventListener("click", async () => {
        if (currentWeekStart >= lastWeekStart) return;
        currentWeekStart = addDays(currentWeekStart, 7);
        await loadWeekAvailability();
    });

    async function loadPublicProfile() {
        if (!configIsReady || !teacherId) {
            profileMessage.textContent = !teacherId
                ? "No teacher was selected. Return to the teacher list."
                : "Add your Supabase URL and publishable key to supabase-config.js.";
            return;
        }

        client = window.supabase.createClient(supabaseUrl, supabaseKey);
        const { data: teacher, error } = await client
            .from("teacher_profiles")
            .select("user_id, headline, bio, languages, native_language, student_levels, teaching_methods, experience_years, lesson_duration_minutes, profiles!inner(full_name, avatar_url)")
            .eq("user_id", teacherId)
            .eq("approval_status", "approved")
            .single();

        if (error || !teacher) {
            profileMessage.textContent = "This teacher profile is unavailable or has not been approved yet.";
            return;
        }

        const profile = Array.isArray(teacher.profiles) ? teacher.profiles[0] : teacher.profiles;
        const avatar = document.getElementById("publicAvatar");
        if (profile.avatar_url) {
            const image = document.createElement("img");
            image.src = profile.avatar_url;
            image.alt = `${profile.full_name} profile`;
            avatar.appendChild(image);
        } else {
            avatar.textContent = initials(profile.full_name);
        }

        document.title = `${profile.full_name} | Polyglot`;
        document.getElementById("publicTeacherName").textContent = profile.full_name;
        document.getElementById("publicTeacherHeadline").textContent = teacher.headline || "Polyglot language teacher";
        document.getElementById("publicExperience").textContent = `${teacher.experience_years ?? 0} years`;
        document.getElementById("publicDuration").textContent = `${teacher.lesson_duration_minutes || 60} minutes`;
        document.getElementById("publicNativeLanguage").textContent = teacher.native_language || "Not specified";
        document.getElementById("publicBio").textContent = teacher.bio || "This teacher has not added a biography yet.";
        document.getElementById("publicMethods").textContent = teacher.teaching_methods || "Teaching details will be added soon.";
        (teacher.languages || []).forEach((language) => addChip(document.getElementById("publicLanguages"), language));
        (teacher.student_levels || []).forEach((level) => addChip(document.getElementById("publicLevels"), level));

        profileMessage.hidden = true;
        publicProfile.hidden = false;
        await initializeBookingCalendar();
    }

    loadPublicProfile();
})();