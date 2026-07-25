(function () {
    "use strict";

    const chatMessage = document.getElementById("chatMessage");
    const chatContent = document.getElementById("chatContent");
    const conversationList = document.getElementById("conversationList");
    const emptyChat = document.getElementById("emptyChat");
    const activeChat = document.getElementById("activeChat");
    const chatUserInitial = document.getElementById("chatUserInitial");
    const chatUserName = document.getElementById("chatUserName");
    const chatUserRole = document.getElementById("chatUserRole");
    const messageList = document.getElementById("messageList");
    const messageForm = document.getElementById("messageForm");
    const messageInput = document.getElementById("messageInput");
    const sendMessageButton = document.getElementById("sendMessageButton");
    const attachFileButton = document.getElementById("attachFileButton");
    const fileInput = document.getElementById("fileInput");
    const selectedFilePreview = document.getElementById(
        "selectedFilePreview"
    );
    const selectedFileName = document.getElementById(
        "selectedFileName"
    );
    const removeSelectedFileButton = document.getElementById(
        "removeSelectedFileButton"
    );
    const navUnreadCount = document.getElementById(
        "navUnreadCount"
    );

    const supabaseUrl = window.POLYGLOT_SUPABASE_URL;
    const supabaseKey = window.POLYGLOT_SUPABASE_KEY;

    const configIsReady = Boolean(
        supabaseUrl &&
        supabaseKey &&
        !supabaseUrl.includes("YOUR_SUPABASE") &&
        !supabaseKey.includes("YOUR_SUPABASE") &&
        window.supabase
    );

    let client = null;
    let currentUser = null;
    let conversations = [];
    let activeConversation = null;
    let realtimeChannel = null;
    let bookingStates = new Map();
    let selectedFile = null;

    const renderedMessageIds = new Set();
    const maximumFileSize = 10 * 1024 * 1024;

    const allowedFileTypes = new Map([
        ["jpg", "image/jpeg"],
        ["jpeg", "image/jpeg"],
        ["png", "image/png"],
        ["webp", "image/webp"],
        ["gif", "image/gif"],
        ["pdf", "application/pdf"],
        ["doc", "application/msword"],
        [
            "docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ],
        ["txt", "text/plain"]
    ]);

    function showChatError(text) {
        chatMessage.textContent = text;
        chatMessage.className = "notice error";
        chatMessage.hidden = false;
    }

    function hideChatNotice() {
        chatMessage.hidden = true;
    }

    function capitalize(value) {
        if (!value) return "User";

        return (
            value.charAt(0).toUpperCase() +
            value.slice(1)
        );
    }

    function getInitial(name) {
        return (name || "P")
            .trim()
            .charAt(0)
            .toUpperCase();
    }

    function formatMessageTime(value) {
        return new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value));
    }

    function formatConversationTime(value) {
        if (!value) return "";

        const date = new Date(value);
        const today = new Date();

        const sameDay =
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate();

        if (sameDay) {
            return formatMessageTime(value);
        }

        return new Intl.DateTimeFormat(undefined, {
            day: "numeric",
            month: "short"
        }).format(date);
    }

    function conversationPreview(conversation) {
        if (!conversation.last_message) {
            return "No messages yet";
        }

        if (
            conversation.last_message_type ===
            "meeting"
        ) {
            return "Google Meet link";
        }

        if (
            conversation.last_message_type ===
            "file"
        ) {
            return `Attachment: ${conversation.last_message}`;
        }

        return conversation.last_message;
    }

    function updateUnreadIndicators() {
        const totalUnread = conversations.reduce(
            (total, conversation) =>
                total +
                Number(
                    conversation.unread_count || 0
                ),
            0
        );

        navUnreadCount.hidden =
            totalUnread === 0;

        navUnreadCount.textContent =
            totalUnread > 99
                ? "99+"
                : String(totalUnread);

        document.title = totalUnread
            ? `(${totalUnread}) Messages | Polyglot`
            : "Messages | Polyglot";
    }

    async function markConversationRead(
        conversationId
    ) {
        const { error } = await client.rpc(
            "mark_conversation_read",
            {
                p_conversation_id: conversationId
            }
        );

        if (error) {
            showChatError(
                `The conversation could not be marked as read: ${error.message}`
            );

            return false;
        }

        return true;
    }

    function fileExtension(fileName) {
        return (
            fileName.split(".").pop() || ""
        )
            .trim()
            .toLowerCase();
    }

    function formatFileSize(size) {
        if (size < 1024) {
            return `${size} B`;
        }

        if (size < 1024 * 1024) {
            return `${(size / 1024).toFixed(
                1
            )} KB`;
        }

        return `${(
            size /
            (1024 * 1024)
        ).toFixed(1)} MB`;
    }

    function validateFile(file) {
        if (!file) {
            return "Choose a file first.";
        }

        if (
            !allowedFileTypes.has(
                fileExtension(file.name)
            )
        ) {
            return "Only JPG, PNG, WEBP, GIF, PDF, DOC, DOCX and TXT files are allowed.";
        }

        if (file.size > maximumFileSize) {
            return "The selected file is larger than 10 MB.";
        }

        return "";
    }

    function safeStorageFileName(fileName) {
        const cleaned = fileName
            .normalize("NFKC")
            .replace(
                /[^\p{L}\p{N}._-]+/gu,
                "_"
            )
            .replace(/^[_\-.]+/, "")
            .slice(-120);

        return cleaned || "attachment";
    }

    function resetSelectedFile() {
        selectedFile = null;
        fileInput.value = "";
        selectedFileName.textContent = "";

        selectedFilePreview.classList.remove(
            "error"
        );

        selectedFilePreview.hidden = true;
    }

    function showFileValidationError(text) {
        selectedFile = null;
        fileInput.value = "";
        selectedFileName.textContent = text;

        selectedFilePreview.classList.add(
            "error"
        );

        selectedFilePreview.hidden = false;
    }

    function showSelectedFile(file) {
        selectedFile = file;

        selectedFilePreview.classList.remove(
            "error"
        );

        selectedFileName.textContent =
            `${file.name} · ${formatFileSize(
                file.size
            )}`;

        selectedFilePreview.hidden = false;
    }

    function createConversationButton(
        conversation
    ) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "conversation-item";

        const unreadCount = Number(
            conversation.unread_count || 0
        );

        if (
            activeConversation?.conversation_id ===
            conversation.conversation_id
        ) {
            button.classList.add("active");
        }

        if (unreadCount > 0) {
            button.classList.add("unread");
        }

        const avatar =
            document.createElement("span");

        avatar.className =
            "conversation-avatar";

        avatar.textContent = getInitial(
            conversation.other_user_name
        );

        const information =
            document.createElement("span");

        information.className =
            "conversation-information";

        const topRow =
            document.createElement("span");

        topRow.className =
            "conversation-top-row";

        const name =
            document.createElement("strong");

        name.textContent =
            conversation.other_user_name;

        const metadata =
            document.createElement("span");

        metadata.className =
            "conversation-metadata";

        const time =
            document.createElement("small");

        time.textContent =
            formatConversationTime(
                conversation.last_message_at
            );

        metadata.appendChild(time);

        if (unreadCount > 0) {
            const badge =
                document.createElement("span");

            badge.className =
                "conversation-unread-count";

            badge.textContent =
                unreadCount > 99
                    ? "99+"
                    : String(unreadCount);

            badge.setAttribute(
                "aria-label",
                `${unreadCount} unread messages`
            );

            metadata.appendChild(badge);
        }

        topRow.append(name, metadata);

        const preview =
            document.createElement("span");

        preview.className =
            "conversation-preview";

        preview.textContent =
            conversationPreview(conversation);

        information.append(topRow, preview);
        button.append(avatar, information);

        button.addEventListener(
            "click",
            () => {
                selectConversation(
                    conversation
                );
            }
        );

        return button;
    }

    function renderConversations() {
        conversationList.replaceChildren();
        updateUnreadIndicators();

        if (!conversations.length) {
            const empty =
                document.createElement("p");

            empty.className =
                "empty-conversation-list";

            empty.textContent =
                "A conversation will appear after a lesson is booked.";

            conversationList.appendChild(
                empty
            );

            return;
        }

        conversations.forEach(
            (conversation) => {
                conversationList.appendChild(
                    createConversationButton(
                        conversation
                    )
                );
            }
        );
    }

    function isSafeMeetUrl(value) {
        try {
            const url = new URL(value);

            return (
                url.protocol === "https:" &&
                url.hostname ===
                    "meet.google.com"
            );
        } catch {
            return false;
        }
    }

    function createSystemMessage(message) {
        const item =
            document.createElement("article");

        const bookingState =
            message.booking_id
                ? bookingStates.get(
                      message.booking_id
                  )
                : null;

        const meetingWasCancelled =
            message.message_type ===
                "meeting" &&
            bookingState?.status ===
                "cancelled";

        item.className =
            message.message_type ===
                "meeting" &&
            !meetingWasCancelled
                ? "meeting-message"
                : "system-message";

        if (meetingWasCancelled) {
            const text =
                document.createElement("span");

            text.textContent =
                "Lesson cancelled. The Google Meet link is no longer active.";

            const time =
                document.createElement("small");

            time.textContent =
                formatMessageTime(
                    message.created_at
                );

            item.append(text, time);
            return item;
        }

        const meetingUrl =
            bookingState?.meeting_url ||
            message.message_text;

        if (
            message.message_type ===
                "meeting" &&
            isSafeMeetUrl(meetingUrl)
        ) {
            const label =
                document.createElement("span");

            label.textContent =
                "Google Meet is ready";

            const link =
                document.createElement("a");

            link.href = meetingUrl;
            link.target = "_blank";
            link.rel =
                "noopener noreferrer";
            link.textContent =
                "Join Google Meet →";

            const time =
                document.createElement("small");

            time.textContent =
                formatMessageTime(
                    message.created_at
                );

            item.append(
                label,
                link,
                time
            );
        } else {
            const text =
                document.createElement("span");

            text.textContent =
                message.message_text;

            const time =
                document.createElement("small");

            time.textContent =
                formatMessageTime(
                    message.created_at
                );

            item.append(text, time);
        }

        return item;
    }

    async function downloadChatFile(
        message,
        button
    ) {
        if (!message.file_path) {
            showChatError(
                "This attachment is not available."
            );

            return;
        }

        const originalText =
            button.textContent;

        button.disabled = true;
        button.textContent =
            "Downloading...";

        const { data, error } =
            await client.storage
                .from("chat-files")
                .download(
                    message.file_path
                );

        button.disabled = false;
        button.textContent =
            originalText;

        if (error || !data) {
            showChatError(
                `The attachment could not be downloaded: ${
                    error?.message ||
                    "Unknown error"
                }`
            );

            return;
        }

        const objectUrl =
            URL.createObjectURL(data);

        const link =
            document.createElement("a");

        link.href = objectUrl;
        link.download =
            message.message_text ||
            "attachment";

        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => {
            URL.revokeObjectURL(
                objectUrl
            );
        }, 1000);
    }

    function createFileMessage(message) {
        const isOwnMessage =
            message.sender_id ===
            currentUser.id;

        const row =
            document.createElement("div");

        row.className = isOwnMessage
            ? "message-row own"
            : "message-row received";

        const bubble =
            document.createElement("article");

        bubble.className =
            "file-message-bubble";

        const icon =
            document.createElement("span");

        icon.className =
            "file-message-icon";

        icon.textContent = "↧";

        icon.setAttribute(
            "aria-hidden",
            "true"
        );

        const details =
            document.createElement("div");

        details.className =
            "file-message-details";

        const name =
            document.createElement("strong");

        name.textContent =
            message.message_text ||
            "Attachment";

        const description =
            document.createElement("span");

        description.textContent =
            "Chat attachment";

        details.append(name, description);

        const downloadButton =
            document.createElement("button");

        downloadButton.type = "button";

        downloadButton.className =
            "file-download-button";

        downloadButton.textContent =
            "Download";

        downloadButton.addEventListener(
            "click",
            () => {
                downloadChatFile(
                    message,
                    downloadButton
                );
            }
        );

        const time =
            document.createElement("small");

        time.textContent =
            formatMessageTime(
                message.created_at
            );

        bubble.append(
            icon,
            details,
            downloadButton,
            time
        );

        row.appendChild(bubble);

        return row;
    }

    function createUserMessage(message) {
        if (
            message.message_type ===
            "file"
        ) {
            return createFileMessage(
                message
            );
        }

        const isOwnMessage =
            message.sender_id ===
            currentUser.id;

        const row =
            document.createElement("div");

        row.className = isOwnMessage
            ? "message-row own"
            : "message-row received";

        const bubble =
            document.createElement("article");

        bubble.className =
            "message-bubble";

        const text =
            document.createElement("p");

        text.textContent =
            message.message_text;

        const time =
            document.createElement("small");

        time.textContent =
            formatMessageTime(
                message.created_at
            );

        bubble.append(text, time);
        row.appendChild(bubble);

        return row;
    }

    function appendMessage(message) {
        if (
            !message?.id ||
            renderedMessageIds.has(
                message.id
            )
        ) {
            return;
        }

        renderedMessageIds.add(
            message.id
        );

        const isSystemMessage =
            message.message_type ===
                "system" ||
            message.message_type ===
                "meeting";

        const element = isSystemMessage
            ? createSystemMessage(message)
            : createUserMessage(message);

        messageList.appendChild(element);

        messageList.scrollTop =
            messageList.scrollHeight;
    }

    async function loadMessages(
        conversationId
    ) {
        renderedMessageIds.clear();
        bookingStates = new Map();
        messageList.replaceChildren();

        const loading =
            document.createElement("p");

        loading.className =
            "loading-messages";

        loading.textContent =
            "Loading messages...";

        messageList.appendChild(loading);

        const { data, error } =
            await client
                .from(
                    "conversation_messages"
                )
                .select(
                    "id, conversation_id, sender_id, message_type, message_text, file_path, booking_id, created_at"
                )
                .eq(
                    "conversation_id",
                    conversationId
                )
                .order("created_at", {
                    ascending: true
                })
                .limit(500);

        messageList.replaceChildren();

        if (error) {
            showChatError(
                `Messages could not be loaded: ${error.message}`
            );

            return;
        }

        if (!data?.length) {
            const empty =
                document.createElement("p");

            empty.className =
                "loading-messages";

            empty.textContent =
                "No messages yet. Start the conversation.";

            messageList.appendChild(
                empty
            );

            return;
        }

        const bookingIds = [
            ...new Set(
                data
                    .map(
                        (message) =>
                            message.booking_id
                    )
                    .filter(Boolean)
            )
        ];

        if (bookingIds.length) {
            const {
                data: bookings,
                error: bookingsError
            } = await client
                .from("lesson_bookings")
                .select(
                    "id, status, meeting_url"
                )
                .in("id", bookingIds);

            if (bookingsError) {
                showChatError(
                    `Lesson statuses could not be loaded: ${bookingsError.message}`
                );
            } else {
                bookingStates = new Map(
                    (bookings || []).map(
                        (booking) => [
                            booking.id,
                            booking
                        ]
                    )
                );
            }
        }

        data.forEach(appendMessage);
    }

    function subscribeToMessages() {
        if (realtimeChannel) {
            client.removeChannel(
                realtimeChannel
            );

            realtimeChannel = null;
        }

        realtimeChannel = client
            .channel(
                `messages-${currentUser.id}`
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table:
                        "conversation_messages"
                },
                async (payload) => {
                    const conversationId =
                        payload.new
                            .conversation_id;

                    if (
                        activeConversation
                            ?.conversation_id ===
                        conversationId
                    ) {
                        const empty =
                            messageList.querySelector(
                                ".loading-messages"
                            );

                        empty?.remove();

                        await loadMessages(
                            conversationId
                        );

                        await markConversationRead(
                            conversationId
                        );
                    }

                    await loadConversations(
                        false
                    );
                }
            )
            .subscribe();
    }

    async function selectConversation(
        conversation
    ) {
        activeConversation =
            conversation;

        resetSelectedFile();
        renderConversations();

        chatUserInitial.textContent =
            getInitial(
                conversation.other_user_name
            );

        chatUserName.textContent =
            conversation.other_user_name;

        chatUserRole.textContent =
            capitalize(
                conversation.other_user_role
            );

        emptyChat.hidden = true;
        activeChat.hidden = false;

        const pageUrl = new URL(
            window.location.href
        );

        pageUrl.searchParams.set(
            "conversation",
            conversation.conversation_id
        );

        window.history.replaceState(
            {},
            "",
            pageUrl
        );

        await loadMessages(
            conversation.conversation_id
        );

        await markConversationRead(
            conversation.conversation_id
        );

        await loadConversations(false);

        messageInput.focus();
    }

    async function loadConversations(
        selectInitialConversation = true
    ) {
        const [
            conversationsResult,
            unreadResult
        ] = await Promise.all([
            client.rpc(
                "get_my_conversations"
            ),
            client.rpc(
                "get_my_unread_conversation_counts"
            )
        ]);

        if (
            conversationsResult.error
        ) {
            showChatError(
                `Conversations could not be loaded: ${conversationsResult.error.message}`
            );

            return false;
        }

        if (unreadResult.error) {
            showChatError(
                `Unread messages could not be loaded: ${unreadResult.error.message}`
            );

            return false;
        }

        const unreadByConversation =
            new Map(
                (
                    unreadResult.data || []
                ).map((item) => [
                    item.conversation_id,
                    Number(
                        item.unread_count ||
                            0
                    )
                ])
            );

        conversations = (
            conversationsResult.data || []
        ).map((conversation) => ({
            ...conversation,
            unread_count:
                unreadByConversation.get(
                    conversation.conversation_id
                ) || 0
        }));

        renderConversations();

        if (
            activeConversation &&
            conversations.length
        ) {
            const refreshedConversation =
                conversations.find(
                    (conversation) =>
                        conversation
                            .conversation_id ===
                        activeConversation
                            .conversation_id
                );

            if (refreshedConversation) {
                activeConversation =
                    refreshedConversation;

                renderConversations();
            }
        }

        if (
            selectInitialConversation &&
            conversations.length
        ) {
            const requestedConversationId =
                new URLSearchParams(
                    window.location.search
                ).get("conversation");

            const requestedConversation =
                conversations.find(
                    (conversation) =>
                        conversation
                            .conversation_id ===
                        requestedConversationId
                );

            if (requestedConversation) {
                await selectConversation(
                    requestedConversation
                );
            }
        }

        chatContent.hidden = false;
        hideChatNotice();

        return true;
    }

    async function sendMessage(event) {
        event.preventDefault();

        if (!activeConversation) {
            return;
        }

        const messageText =
            messageInput.value.trim();

        const fileToSend =
            selectedFile;

        if (
            !messageText &&
            !fileToSend
        ) {
            return;
        }

        if (fileToSend) {
            const validationError =
                validateFile(fileToSend);

            if (validationError) {
                showFileValidationError(
                    validationError
                );

                return;
            }
        }

        sendMessageButton.disabled = true;
        attachFileButton.disabled = true;

        sendMessageButton.textContent =
            fileToSend
                ? "Uploading..."
                : "Sending...";

        let uploadedFilePath = "";

        if (fileToSend) {
            const extension =
                fileExtension(
                    fileToSend.name
                );

            const storageName =
                safeStorageFileName(
                    fileToSend.name
                );

            uploadedFilePath = [
                activeConversation
                    .conversation_id,
                currentUser.id,
                `${crypto.randomUUID()}-${storageName}`
            ].join("/");

            const {
                error: uploadError
            } = await client.storage
                .from("chat-files")
                .upload(
                    uploadedFilePath,
                    fileToSend,
                    {
                        cacheControl: "3600",
                        contentType:
                            allowedFileTypes.get(
                                extension
                            ),
                        upsert: false
                    }
                );

            if (uploadError) {
                sendMessageButton.disabled =
                    false;

                attachFileButton.disabled =
                    false;

                sendMessageButton.textContent =
                    "Send";

                showChatError(
                    `The attachment could not be uploaded: ${uploadError.message}`
                );

                return;
            }
        }

        const messagesToInsert = [];

        if (messageText) {
            messagesToInsert.push({
                conversation_id:
                    activeConversation
                        .conversation_id,

                sender_id:
                    currentUser.id,

                message_type: "text",
                message_text: messageText
            });
        }

        if (fileToSend) {
            messagesToInsert.push({
                conversation_id:
                    activeConversation
                        .conversation_id,

                sender_id:
                    currentUser.id,

                message_type: "file",

                message_text:
                    fileToSend.name,

                file_path:
                    uploadedFilePath
            });
        }

        const { data, error } =
            await client
                .from(
                    "conversation_messages"
                )
                .insert(
                    messagesToInsert
                )
                .select(
                    "id, conversation_id, sender_id, message_type, message_text, file_path, booking_id, created_at"
                );

        sendMessageButton.disabled = false;
        attachFileButton.disabled = false;
        sendMessageButton.textContent =
            "Send";

        if (error) {
            if (uploadedFilePath) {
                await client.storage
                    .from("chat-files")
                    .remove([
                        uploadedFilePath
                    ]);
            }

            showChatError(
                `Message could not be sent: ${error.message}`
            );

            return;
        }

        messageInput.value = "";

        messageInput.style.height =
            "auto";

        resetSelectedFile();

        const empty =
            messageList.querySelector(
                ".loading-messages"
            );

        empty?.remove();

        (data || []).forEach(
            appendMessage
        );

        await loadConversations(false);
    }

    async function initializeChat() {
        const {
            data: userData,
            error: userError
        } = await client.auth.getUser();

        if (
            userError ||
            !userData.user
        ) {
            window.location.replace(
                "login.html#login"
            );

            return;
        }

        currentUser = userData.user;

        await loadConversations();
        subscribeToMessages();
    }

    messageForm.addEventListener(
        "submit",
        sendMessage
    );

    messageInput.addEventListener(
        "input",
        () => {
            messageInput.style.height =
                "auto";

            messageInput.style.height =
                `${Math.min(
                    messageInput.scrollHeight,
                    150
                )}px`;
        }
    );

    attachFileButton.addEventListener(
        "click",
        () => {
            fileInput.click();
        }
    );

    fileInput.addEventListener(
        "change",
        () => {
            const file =
                fileInput.files?.[0];

            if (!file) {
                resetSelectedFile();
                return;
            }

            const validationError =
                validateFile(file);

            if (validationError) {
                showFileValidationError(
                    validationError
                );

                return;
            }

            hideChatNotice();
            showSelectedFile(file);
        }
    );

    removeSelectedFileButton.addEventListener(
        "click",
        resetSelectedFile
    );

    document
        .getElementById("logoutButton")
        .addEventListener(
            "click",
            async () => {
                const button =
                    document.getElementById(
                        "logoutButton"
                    );

                button.disabled = true;

                button.textContent =
                    "Logging out...";

                if (realtimeChannel) {
                    await client.removeChannel(
                        realtimeChannel
                    );
                }

                await client.auth.signOut();

                window.location.replace(
                    "login.html#login"
                );
            }
        );

    if (!configIsReady) {
        showChatError(
            "Add your Supabase URL and publishable key to supabase-config.js."
        );

        return;
    }

    client =
        window.supabase.createClient(
            supabaseUrl,
            supabaseKey
        );

    client.auth.onAuthStateChange(
        (event) => {
            if (event === "SIGNED_OUT") {
                window.location.replace(
                    "login.html#login"
                );
            }
        }
    );

    initializeChat();
})();