(function () {
    "use strict";

    const form = document.getElementById("weeklyScheduleForm");
    const rowsContainer = document.getElementById("weeklyScheduleRows");
    const saveButton = document.getElementById("saveScheduleButton");
    const bookingsList = document.getElementById("teacherBookings");
    const message = document.getElementById("scheduleMessage");
    const durationHint = document.getElementById("lessonDurationHint");
    const timezoneBadge = document.getElementById("teacherTimezone");
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    if (!form || !rowsContainer || !bookingsList) return;

    const url = window.POLYGLOT_SUPABASE_URL;
    const key = window.POLYGLOT_SUPABASE_KEY;
    const ready = Boolean(
        url && key &&
        !url.includes("YOUR_SUPABASE") &&
        !key.includes("YOUR_SUPABASE") &&
        window.supabase
    );

    let client = null;
    let teacherId = null;
    let lessonDuration = 60;
    let scheduleTimezone = browserTimezone;
    let approvalStatus = "pending";

    function showMessage(text, type = "error") {
        message.textContent = text;
        message.className = `notice ${type}`;
        message.hidden = false;
    }

    function hideMessage() {
        message.hidden = true;
        message.textContent = "";
    }

    function formatDate(value) {
        return new Intl.DateTimeFormat(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        }).format(new Date(value));
    }

    function formatTime(value) {
        return new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value));
    }

    function minutesFromTime(value) {
        const [hours, minutes] = value.split(":").map(Number);
        return hours * 60 + minutes;
    }

    function createDayRow(day, index, savedRule) {
        const row = document.createElement("div");
        row.className = "weekly-day-row";
        row.dataset.weekday = String(index + 1);

        const dayLabel = document.createElement("label");
        dayLabel.className = "weekly-day-toggle";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(savedRule);

        const switchMark = document.createElement("span");
        switchMark.className = "weekly-toggle-mark";

        const dayName = document.createElement("strong");
        dayName.textContent = day;
        dayLabel.append(checkbox, switchMark, dayName);

        const startInput = document.createElement("input");
        startInput.type = "time";
        startInput.className = "weekly-time-input start-time";
        startInput.value = savedRule?.start_time?.slice(0, 5) || "09:00";
        startInput.disabled = !savedRule;
        startInput.setAttribute("aria-label", `${day} start time`);

        const endInput = document.createElement("input");
        endInput.type = "time";
        endInput.className = "weekly-time-input end-time";
        endInput.value = savedRule?.end_time?.slice(0, 5) || "17:00";
        endInput.disabled = !savedRule;
        endInput.setAttribute("aria-label", `${day} end time`);

        checkbox.addEventListener("change", () => {
            startInput.disabled = !checkbox.checked;
            endInput.disabled = !checkbox.checked;
            row.classList.toggle("enabled", checkbox.checked);
        });

        row.classList.toggle("enabled", checkbox.checked);
        row.append(dayLabel, startInput, endInput);
        return row;
    }

    function renderScheduleRows(rules) {
        const savedByDay = new Map((rules || []).map((rule) => [Number(rule.weekday), rule]));
        rowsContainer.replaceChildren();
        days.forEach((day, index) => {
            rowsContainer.appendChild(createDayRow(day, index, savedByDay.get(index + 1)));
        });
    }

    function createBookingElement(slot) {
        const item = document.createElement("article");
        item.className = "schedule-slot";

        const details = document.createElement("div");
        details.className = "schedule-slot-details";

        const date = document.createElement("strong");
        date.textContent = formatDate(slot.starts_at);

        const time = document.createElement("span");
        time.className = "schedule-slot-time";
        time.textContent = `${formatTime(slot.starts_at)}–${formatTime(slot.ends_at)}`;

        const status = document.createElement("span");
        status.className = "slot-status booked";
        status.textContent = "Booked";

        details.append(date, time);
        item.append(details, status);
        return item;
    }

    async function loadBookings() {
        const { data, error } = await client
            .from("teacher_availability")
            .select("id, starts_at, ends_at, status")
            .eq("teacher_id", teacherId)
            .eq("status", "booked")
            .gte("ends_at", new Date().toISOString())
            .order("starts_at", { ascending: true })
            .limit(12);

        bookingsList.replaceChildren();
        if (error) {
            showMessage(`Bookings could not be loaded: ${error.message}`);
            return;
        }

        if (!data?.length) {
            const empty = document.createElement("p");
            empty.className = "empty-slots-message";
            empty.textContent = "You do not have any upcoming booked lessons yet.";
            bookingsList.appendChild(empty);
            return;
        }

        data.forEach((slot) => bookingsList.appendChild(createBookingElement(slot)));
    }

    async function initializeSchedule() {
        if (window.location.hash === "#availability") {
            document.getElementById("profileStepCard")?.classList.remove("accent-card");
            document.getElementById("scheduleStepCard")?.classList.add("accent-card");
        }

        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError || !userData.user) return;
        teacherId = userData.user.id;

        const [{ data: teacher, error: teacherError }, { data: rules, error: rulesError }] =
            await Promise.all([
                client
                    .from("teacher_profiles")
                    .select("approval_status, lesson_duration_minutes, timezone")
                    .eq("user_id", teacherId)
                    .single(),
                client
                    .from("teacher_weekly_availability")
                    .select("weekday, start_time, end_time")
                    .eq("teacher_id", teacherId)
                    .order("weekday", { ascending: true })
            ]);

        if (teacherError || rulesError || !teacher) {
            showMessage("Weekly schedule could not be initialized. Run the newest supabase-setup.sql file.");
            return;
        }

        lessonDuration = teacher.lesson_duration_minutes || 60;
        approvalStatus = teacher.approval_status;
        scheduleTimezone = rules?.length ? (teacher.timezone || browserTimezone) : browserTimezone;
        timezoneBadge.textContent = scheduleTimezone;
        durationHint.textContent =
            `The system will divide each working period into ${lessonDuration}-minute lesson times.`;
        renderScheduleRows(rules || []);
        await loadBookings();
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideMessage();

        const selectedRows = [...rowsContainer.querySelectorAll(".weekly-day-row")]
            .filter((row) => row.querySelector("input[type='checkbox']").checked);

        if (!selectedRows.length) {
            showMessage("Enable at least one working day.");
            return;
        }

        const rules = [];
        for (const row of selectedRows) {
            const startTime = row.querySelector(".start-time").value;
            const endTime = row.querySelector(".end-time").value;

            if (!startTime || !endTime || minutesFromTime(endTime) <= minutesFromTime(startTime)) {
                showMessage("For every enabled day, the end time must be later than the start time.");
                return;
            }

            if (minutesFromTime(endTime) - minutesFromTime(startTime) < lessonDuration) {
                showMessage(`Every working period must fit at least one ${lessonDuration}-minute lesson.`);
                return;
            }

            rules.push({
                weekday: Number(row.dataset.weekday),
                start_time: startTime,
                end_time: endTime
            });
        }

        saveButton.disabled = true;
        saveButton.querySelector("span:first-child").textContent = "Saving...";

        const { error } = await client.rpc("save_teacher_weekly_schedule", {
            p_rules: rules,
            p_timezone: scheduleTimezone
        });

        saveButton.disabled = false;
        saveButton.querySelector("span:first-child").textContent = "Save weekly schedule";

        if (error) {
            showMessage(error.message);
            return;
        }

        const approvalNote = approvalStatus === "approved"
            ? "Students can now see and book these hours."
            : "The hours will become public after your teacher profile is approved.";
        showMessage(`Your weekly schedule has been saved. ${approvalNote}`, "success");
        await loadBookings();
    });

    if (!ready) {
        showMessage("Add your Supabase URL and publishable key to supabase-config.js.");
        form.hidden = true;
        return;
    }

    client = window.supabase.createClient(url, key);
    initializeSchedule();
})();
