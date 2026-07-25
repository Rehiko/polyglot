(function () {
    "use strict";

    const chatMessage = document.getElementById("chatMessage");
    const chatContent = document.getElementById("chatContent");

    const conversationList =
        document.getElementById("conversationList");

    const emptyChat = document.getElementById("emptyChat");
    const activeChat = document.getElementById("activeChat");

    const chatUserInitial =
        document.getElementById("chatUserInitial");

    const chatUserName =
        document.getElementById("chatUserName");

    const chatUserRole =
        document.getElementById("chatUserRole");

    const messageList =
        document.getElementById("messageList");

    const messageForm =
        document.getElementById("messageForm");

    const messageInput =
        document.getElementById("messageInput");

    const sendMessageButton =
        document.getElementById("sendMessageButton");

    const supabaseUrl =
        window.POLYGLOT_SUPABASE_URL;

    const supabaseKey =
        window.POLYGLOT_SUPABASE_KEY;

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

    const renderedMessageIds = new Set();

    function showChatError(text) {
        chatMessage.textContent = text;
        chatMessage.className = "notice error";
        chatMessage.hidden = false;
    }

    function showChatNotice(text) {
        chatMessage.textContent = text;
        chatMessage.className = "notice success";
        chatMessage.hidden = false;
    }

    function hideChatNotice() {
        chatMessage.hidden = true;
    }

    function capitalize(value) {
        if (!value) return "User";

        return value.charAt(0).toUpperCase() + value.slice(1);
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

        if (conversation.last_message_type === "meeting") {
            return "Google Meet link";
        }

        return conversation.last_message;
    }

    function createConversationButton(conversation) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "conversation-item";

        if (
            activeConversation?.conversation_id ===
            conversation.conversation_id
        ) {
            button.classList.add("active");
        }

        const avatar = document.createElement("span");
        avatar.className = "conversation-avatar";
        avatar.textContent = getInitial(
            conversation.other_user_name
        );

        const information = document.createElement("span");
        information.className = "conversation-information";

        const topRow = document.createElement("span");
        topRow.className = "conversation-top-row";

        const name = document.createElement("strong");
        name.textContent = conversation.other_user_name;

        const time = document.createElement("small");
        time.textContent = formatConversationTime(
            conversation.last_message_at
        );

        topRow.append(name, time);

        const preview = document.createElement("span");
        preview.className = "conversation-preview";
        preview.textContent =
            conversationPreview(conversation);

        information.append(topRow, preview);
        button.append(avatar, information);

        button.addEventListener("click", () => {
            selectConversation(conversation);
        });

        return button;
    }

    function renderConversations() {
        conversationList.replaceChildren();

        if (!conversations.length) {
            const empty = document.createElement("p");
            empty.className = "empty-conversation-list";

            empty.textContent =
                "A conversation will appear after a lesson is booked.";

            conversationList.appendChild(empty);
            return;
        }

        conversations.forEach((conversation) => {
            conversationList.appendChild(
                createConversationButton(conversation)
            );
        });
    }

    function isSafeMeetUrl(value) {
        try {
            const url = new URL(value);

            return (
                url.protocol === "https:" &&
                url.hostname === "meet.google.com"
            );
        } catch {
            return false;
        }
    }

    function createSystemMessage(message) {
        const item = document.createElement("article");

        item.className =
            message.message_type === "meeting"
                ? "meeting-message"
                : "system-message";

        if (
            message.message_type === "meeting" &&
            isSafeMeetUrl(message.message_text)
        ) {
            const label = document.createElement("span");
            label.textContent = "Google Meet is ready";

            const link = document.createElement("a");
            link.href = message.message_text;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "Join Google Meet →";

            const time = document.createElement("small");
            time.textContent = formatMessageTime(
                message.created_at
            );

            item.append(label, link, time);
        } else {
            const text = document.createElement("span");
            text.textContent = message.message_text;

            const time = document.createElement("small");
            time.textContent = formatMessageTime(
                message.created_at
            );

            item.append(text, time);
        }

        return item;
    }

    function createUserMessage(message) {
        const isOwnMessage =
            message.sender_id === currentUser.id;

        const row = document.createElement("div");

        row.className = isOwnMessage
            ? "message-row own"
            : "message-row received";

        const bubble = document.createElement("article");
        bubble.className = "message-bubble";

        const text = document.createElement("p");
        text.textContent = message.message_text;

        const time = document.createElement("small");
        time.textContent = formatMessageTime(
            message.created_at
        );

        bubble.append(text, time);
        row.appendChild(bubble);

        return row;
    }

    function appendMessage(message) {
        if (
            !message?.id ||
            renderedMessageIds.has(message.id)
        ) {
            return;
        }

        renderedMessageIds.add(message.id);

        const isSystemMessage =
            message.message_type === "system" ||
            message.message_type === "meeting";

        const element = isSystemMessage
            ? createSystemMessage(message)
            : createUserMessage(message);

        messageList.appendChild(element);

        messageList.scrollTop =
            messageList.scrollHeight;
    }

    async function loadMessages(conversationId) {
        renderedMessageIds.clear();
        messageList.replaceChildren();

        const loading = document.createElement("p");
        loading.className = "loading-messages";
        loading.textContent = "Loading messages...";

        messageList.appendChild(loading);

        const { data, error } = await client
            .from("conversation_messages")
            .select(
                "id, conversation_id, sender_id, message_type, message_text, file_path, booking_id, created_at"
            )
            .eq("conversation_id", conversationId)
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
            const empty = document.createElement("p");
            empty.className = "loading-messages";

            empty.textContent =
                "No messages yet. Start the conversation.";

            messageList.appendChild(empty);
            return;
        }

        data.forEach(appendMessage);
    }

    function subscribeToConversation(conversationId) {
        if (realtimeChannel) {
            client.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }

        realtimeChannel = client
            .channel(`conversation-${conversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "conversation_messages",
                    filter:
                        `conversation_id=eq.${conversationId}`
                },
                async (payload) => {
                    const empty =
                        messageList.querySelector(
                            ".loading-messages"
                        );

                    empty?.remove();

                    appendMessage(payload.new);

                    await loadConversations(false);
                }
            )
            .subscribe();
    }

    async function selectConversation(conversation) {
        activeConversation = conversation;

        renderConversations();

        chatUserInitial.textContent =
            getInitial(conversation.other_user_name);

        chatUserName.textContent =
            conversation.other_user_name;

        chatUserRole.textContent =
            capitalize(conversation.other_user_role);

        emptyChat.hidden = true;
        activeChat.hidden = false;

        const pageUrl = new URL(window.location.href);

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

        subscribeToConversation(
            conversation.conversation_id
        );

        messageInput.focus();
    }

    async function loadConversations(
        selectInitialConversation = true
    ) {
        const { data, error } = await client.rpc(
            "get_my_conversations"
        );

        if (error) {
            showChatError(
                `Conversations could not be loaded: ${error.message}`
            );

            return false;
        }

        conversations = data || [];
        renderConversations();

        if (
            activeConversation &&
            conversations.length
        ) {
            const refreshedConversation =
                conversations.find(
                    (conversation) =>
                        conversation.conversation_id ===
                        activeConversation.conversation_id
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
                        conversation.conversation_id ===
                        requestedConversationId
                );

            await selectConversation(
                requestedConversation ||
                conversations[0]
            );
        }

        chatContent.hidden = false;
        hideChatNotice();

        return true;
    }

    async function sendMessage(event) {
        event.preventDefault();

        if (!activeConversation) return;

        const messageText =
            messageInput.value.trim();

        if (!messageText) return;

        sendMessageButton.disabled = true;
        sendMessageButton.textContent = "Sending...";

        const { data, error } = await client
            .from("conversation_messages")
            .insert({
                conversation_id:
                    activeConversation.conversation_id,

                sender_id: currentUser.id,
                message_type: "text",
                message_text: messageText
            })
            .select(
                "id, conversation_id, sender_id, message_type, message_text, file_path, booking_id, created_at"
            )
            .single();

        sendMessageButton.disabled = false;
        sendMessageButton.textContent = "Send";

        if (error) {
            showChatError(
                `Message could not be sent: ${error.message}`
            );

            return;
        }

        messageInput.value = "";
        messageInput.style.height = "auto";

        const empty =
            messageList.querySelector(
                ".loading-messages"
            );

        empty?.remove();

        appendMessage(data);

        await loadConversations(false);
    }

    async function initializeChat() {
        const {
            data: userData,
            error: userError
        } = await client.auth.getUser();

        if (userError || !userData.user) {
            window.location.replace(
                "login.html#login"
            );

            return;
        }

        currentUser = userData.user;

        await loadConversations();
    }

    messageForm.addEventListener(
        "submit",
        sendMessage
    );

    messageInput.addEventListener("input", () => {
        messageInput.style.height = "auto";

        messageInput.style.height =
            `${Math.min(messageInput.scrollHeight, 150)}px`;
    });

    document
        .getElementById("logoutButton")
        .addEventListener("click", async () => {
            const button =
                document.getElementById("logoutButton");

            button.disabled = true;
            button.textContent = "Logging out...";

            if (realtimeChannel) {
                await client.removeChannel(
                    realtimeChannel
                );
            }

            await client.auth.signOut();

            window.location.replace(
                "login.html#login"
            );
        });

    if (!configIsReady) {
        showChatError(
            "Add your Supabase URL and publishable key to supabase-config.js."
        );

        return;
    }

    client = window.supabase.createClient(
        supabaseUrl,
        supabaseKey
    );

    client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
            window.location.replace(
                "login.html#login"
            );
        }
    });

    initializeChat();
})();