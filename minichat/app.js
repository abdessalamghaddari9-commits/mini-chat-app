const STORAGE_KEY = "minichat_v2_state";
const PROFILE_KEY = "minichat_v2_profile";

const $ = (id) => document.getElementById(id);

const loginScreen = $("loginScreen");
const appRoot = $("appRoot");

const loginForm = $("loginForm");
const profileName = $("profileName");
const profileStatus = $("profileStatus");
const profileAvatar = $("profileAvatar");

const meName = $("meName");
const meStatus = $("meStatus");
const meAvatar = $("meAvatar");
const logoutBtn = $("logoutBtn");

const contactsEl = $("contacts");
const messagesEl = $("messages");
const chatNameEl = $("chatName");
const chatStatusEl = $("chatStatus");
const chatAvatarEl = $("chatAvatar");

const messageInput = $("messageInput");
const sendBtn = $("sendBtn");
const deleteChatBtn = $("deleteChatBtn");

const searchInput = $("searchInput");
const clearAllBtn = $("clearAllBtn");

const newChatBtn = $("newChatBtn");
const modalBackdrop = $("modalBackdrop");
const newName = $("newName");
const newStatus = $("newStatus");
const cancelModal = $("cancelModal");
const saveContact = $("saveContact");

const sidebar = $("sidebar");
const toggleSidebarBtn = $("toggleSidebarBtn");

function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function initials(name) {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] || "U";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase();
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[c]));
}

function loadProfile() {
  const raw = localStorage.getItem(PROFILE_KEY);
  return raw ? JSON.parse(raw) : null;
}
function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);

  return {
    activeId: "c1",
    contacts: [
      { id: "c1", name: "Sara", status: "Online", avatar: null, messages: [
        { from: "you", text: "Hi! Welcome to MiniChat 😄", time: nowTime(), seen: true },
        { from: "me", text: "Looks awesome!", time: nowTime(), seen: true }
      ]},
      { id: "c2", name: "Youssef", status: "Last seen today", avatar: null, messages: [] },
      { id: "c3", name: "Maria", status: "Busy", avatar: null, messages: [] },
    ]
  };
}
let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setActive(id) {
  state.activeId = id;
  saveState();
  render();
}

function getActiveContact() {
  return state.contacts.find(c => c.id === state.activeId) || null;
}

function setAvatar(el, name, avatarDataUrl) {
  el.innerHTML = "";
  if (avatarDataUrl) {
    const img = document.createElement("img");
    img.src = avatarDataUrl;
    img.alt = name;
    el.appendChild(img);
  } else {
    el.textContent = initials(name);
  }
}

function renderContacts(filter = "") {
  contactsEl.innerHTML = "";
  const q = filter.trim().toLowerCase();

  const list = state.contacts.filter(c => {
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.status.toLowerCase().includes(q);
  });

  list.forEach(c => {
    const item = document.createElement("div");
    item.className = "contact" + (c.id === state.activeId ? " active" : "");
    item.innerHTML = `
      <div class="avatar"></div>
      <div class="c-meta">
        <div class="c-name">${escapeHtml(c.name)}</div>
        <div class="c-status">${escapeHtml(c.status)}</div>
      </div>
    `;
    setAvatar(item.querySelector(".avatar"), c.name, c.avatar);

    item.addEventListener("click", () => {
      setActive(c.id);
      sidebar.classList.remove("open");
    });

    contactsEl.appendChild(item);
  });

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.style.color = "rgba(255,255,255,.65)";
    empty.style.padding = "12px 10px";
    empty.textContent = "No contacts found.";
    contactsEl.appendChild(empty);
  }
}

function renderMessages(contact) {
  messagesEl.innerHTML = "";

  if (!contact) {
    messagesEl.innerHTML = `
      <div class="empty">
        <h2>Welcome 👋</h2>
        <p>Select a contact to start chatting.</p>
      </div>`;
    return;
  }

  if (contact.messages.length === 0) {
    messagesEl.innerHTML = `
      <div class="empty">
        <h2>No messages yet</h2>
        <p>Send your first message to ${escapeHtml(contact.name)}.</p>
      </div>`;
    return;
  }

  contact.messages.forEach(m => {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${m.from === "me" ? "me" : "you"}`;
    bubble.innerHTML = `
      <div>${escapeHtml(m.text)}</div>
      <div class="bmeta">
        <span>${m.time}</span>
        <span>${m.from === "me" ? (m.seen ? "Seen ✓✓" : "Delivered ✓") : ""}</span>
      </div>
    `;
    messagesEl.appendChild(bubble);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderHeader(contact) {
  if (!contact) {
    chatNameEl.textContent = "Select a contact";
    chatStatusEl.textContent = "—";
    setAvatar(chatAvatarEl, "A", null);
    messageInput.disabled = true;
    sendBtn.disabled = true;
    deleteChatBtn.disabled = true;
    return;
  }

  chatNameEl.textContent = contact.name;
  chatStatusEl.textContent = contact.status;
  setAvatar(chatAvatarEl, contact.name, contact.avatar);

  messageInput.disabled = false;
  sendBtn.disabled = false;
  deleteChatBtn.disabled = false;
}

function renderProfile() {
  const profile = loadProfile();
  if (!profile) return;
  meName.textContent = profile.name;
  meStatus.textContent = profile.status || "Available";
  setAvatar(meAvatar, profile.name, profile.avatar || null);
}

function render() {
  const active = getActiveContact();
  renderProfile();
  renderContacts(searchInput.value);
  renderHeader(active);
  renderMessages(active);
}

function sendMessage() {
  const active = getActiveContact();
  if (!active) return;

  const text = messageInput.value.trim();
  if (!text) return;

  active.messages.push({ from: "me", text, time: nowTime(), seen: false });
  messageInput.value = "";
  saveState();
  render();

  // Fake auto-reply + seen status
  setTimeout(() => {
    const last = active.messages[active.messages.length - 1];
    if (last && last.from === "me") last.seen = true;

    active.messages.push({
      from: "you",
      text: "Got it 👍 (demo reply)",
      time: nowTime(),
      seen: true
    });

    saveState();
    render();
  }, 700);
}

/* EVENTS */
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

deleteChatBtn.addEventListener("click", () => {
  const active = getActiveContact();
  if (!active) return;
  active.messages = [];
  saveState();
  render();
});

searchInput.addEventListener("input", () => {
  renderContacts(searchInput.value);
});

clearAllBtn.addEventListener("click", () => {
  if (!confirm("Clear all chats?")) return;
  state.contacts.forEach(c => c.messages = []);
  saveState();
  render();
});

toggleSidebarBtn.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

newChatBtn.addEventListener("click", () => {
  modalBackdrop.hidden = false;
  newName.value = "";
  newStatus.value = "";
  newName.focus();
});

cancelModal.addEventListener("click", () => {
  modalBackdrop.hidden = true;
});

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) modalBackdrop.hidden = true;
});

saveContact.addEventListener("click", () => {
  const name = newName.value.trim();
  const status = newStatus.value.trim() || "New contact";
  if (!name) return alert("Please enter a name.");

  const id = "c" + Math.random().toString(16).slice(2, 8);
  state.contacts.unshift({ id, name, status, avatar: null, messages: [] });
  state.activeId = id;
  saveState();
  modalBackdrop.hidden = true;
  render();
});

/* LOGIN */
function showApp() {
  loginScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");
  render();
}
function showLogin() {
  appRoot.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = profileName.value.trim();
  if (!name) return;

  const status = profileStatus.value.trim();
  let avatar = null;

  const file = profileAvatar.files?.[0];
  if (file) {
    avatar = await fileToDataUrl(file);
  }

  saveProfile({ name, status, avatar });
  showApp();
});

logoutBtn.addEventListener("click", () => {
  if (!confirm("Logout?")) return;
  localStorage.removeItem(PROFILE_KEY);
  showLogin();
});

/* INIT */
(function init() {
  const profile = loadProfile();
  if (profile && profile.name) {
    showApp();
  } else {
    showLogin();
  }
})();