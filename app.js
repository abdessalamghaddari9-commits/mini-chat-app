// ====== STORAGE KEYS ======
const LS_PROFILE = "minichat_profile_v1";
const LS_CONTACTS = "minichat_contacts_v1";
const LS_MESSAGES = "minichat_messages_v1"; // object: { contactId: [ {text, time, me} ] }

// ====== ELEMENTS ======
const loginScreen = document.getElementById("loginScreen");
const appRoot = document.getElementById("appRoot");

const profileForm = document.getElementById("profileForm");
const profileName = document.getElementById("profileName");
const profileStatus = document.getElementById("profileStatus");

const userName = document.getElementById("userName");
const userStatus = document.getElementById("userStatus");
const avatar = document.getElementById("avatar");

const addContactBtn = document.getElementById("addContactBtn");
const modalBackdrop = document.getElementById("modalBackdrop");
const contactForm = document.getElementById("contactForm");
const contactName = document.getElementById("contactName");
const contactStatus = document.getElementById("contactStatus");
const cancelBtn = document.getElementById("cancelBtn");

const contactsList = document.getElementById("contactsList");
const contactsCount = document.getElementById("contactsCount");

const activeAvatar = document.getElementById("activeAvatar");
const activeName = document.getElementById("activeName");
const activeSub = document.getElementById("activeSub");

const messagesEl = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const clearChatBtn = document.getElementById("clearChatBtn");

// ====== STATE ======
let state = {
  profile: null,
  contacts: [],
  activeContactId: null,
  messagesByContact: {} // {id: []}
};

// ====== HELPERS ======
function saveProfile(profile) {
  localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
}
function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(LS_PROFILE));
  } catch {
    return null;
  }
}

function saveContacts(contacts) {
  localStorage.setItem(LS_CONTACTS, JSON.stringify(contacts));
}
function loadContacts() {
  try {
    return JSON.parse(localStorage.getItem(LS_CONTACTS)) || [];
  } catch {
    return [];
  }
}

function saveMessages(obj) {
  localStorage.setItem(LS_MESSAGES, JSON.stringify(obj));
}
function loadMessages() {
  try {
    return JSON.parse(localStorage.getItem(LS_MESSAGES)) || {};
  } catch {
    return {};
  }
}

function initials(name) {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function nowTime() {
  const d = new Date();
  return d.toLocaleString();
}

function openModal() {
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden", "false");
  contactName.focus();
}

function closeModal() {
  // ✅ هذا هو الحل الحقيقي ديال Cancel:
  contactForm.reset();
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden", "true");
}

function setActiveContact(id) {
  state.activeContactId = id;

  const c = state.contacts.find(x => x.id === id);
  if (!c) return;

  activeAvatar.textContent = initials(c.name);
  activeName.textContent = c.name;
  activeSub.textContent = c.status || "Online";

  messageInput.disabled = false;
  sendBtn.disabled = false;

  renderContacts();
  renderMessages();
}

function renderContacts() {
  contactsCount.textContent = String(state.contacts.length);

  contactsList.innerHTML = "";
  if (state.contacts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No contacts yet. Click “+ New Contact”.";
    contactsList.appendChild(empty);
    return;
  }

  state.contacts.forEach(c => {
    const item = document.createElement("div");
    item.className = "contact" + (c.id === state.activeContactId ? " active" : "");
    item.innerHTML = `
      <div class="c-avatar">${initials(c.name)}</div>
      <div>
        <div class="c-name">${c.name}</div>
        <div class="c-status">${c.status || "Online"}</div>
      </div>
    `;
    item.addEventListener("click", () => setActiveContact(c.id));
    contactsList.appendChild(item);
  });
}

function renderMessages() {
  messagesEl.innerHTML = "";

  const id = state.activeContactId;
  if (!id) {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Select a contact to start chatting.";
    messagesEl.appendChild(hint);
    return;
  }

  const arr = state.messagesByContact[id] || [];
  if (arr.length === 0) {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "No messages yet. Say hi 👋";
    messagesEl.appendChild(hint);
    return;
  }

  arr.forEach(m => {
    const bubble = document.createElement("div");
    bubble.className = "msg" + (m.me ? " me" : "");
    bubble.innerHTML = `
      <div class="text">${escapeHtml(m.text)}</div>
      <span class="time">${m.time}</span>
    `;
    messagesEl.appendChild(bubble);
  });

  // scroll bottom
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function boot() {
  state.profile = loadProfile();
  state.contacts = loadContacts();
  state.messagesByContact = loadMessages();

  if (state.profile) {
    // go to app
    loginScreen.classList.add("hidden");
    appRoot.classList.remove("hidden");

    userName.textContent = state.profile.name;
    userStatus.textContent = state.profile.status;
    avatar.textContent = initials(state.profile.name);

    renderContacts();

    // auto select first contact if exists
    if (state.contacts.length > 0) {
      setActiveContact(state.contacts[0].id);
    }
  } else {
    // stay on login
    loginScreen.classList.remove("hidden");
    appRoot.classList.add("hidden");
  }
}

// ====== EVENTS ======

// Login/Profile
profileForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const p = {
    name: profileName.value.trim(),
    status: profileStatus.value.trim()
  };

  if (!p.name || !p.status) return;

  saveProfile(p);
  boot();
});

// Open modal
addContactBtn.addEventListener("click", () => {
  openModal();
});

// ✅ Cancel button (حل المشكل)
cancelBtn.addEventListener("click", (e) => {
  e.preventDefault();
  closeModal();
});

// Click outside modal closes it
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

// ESC closes modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalBackdrop.classList.contains("hidden")) {
    closeModal();
  }
});

// Save new contact
contactForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const name = contactName.value.trim();
  const status = contactStatus.value.trim();

  if (!name || !status) return;

  const newContact = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name,
    status
  };

  state.contacts.unshift(newContact);
  saveContacts(state.contacts);

  // create messages bucket
  if (!state.messagesByContact[newContact.id]) {
    state.messagesByContact[newContact.id] = [];
    saveMessages(state.messagesByContact);
  }

  closeModal();
  renderContacts();
  setActiveContact(newContact.id);
});

// Send message
messageForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = state.activeContactId;
  if (!id) return;

  const text = messageInput.value.trim();
  if (!text) return;

  const msg = { text, time: nowTime(), me: true };

  if (!state.messagesByContact[id]) state.messagesByContact[id] = [];
  state.messagesByContact[id].push(msg);

  saveMessages(state.messagesByContact);

  messageInput.value = "";
  renderMessages();
});

// Clear chat
clearChatBtn.addEventListener("click", () => {
  const id = state.activeContactId;
  if (!id) return;

  state.messagesByContact[id] = [];
  saveMessages(state.messagesByContact);
  renderMessages();
});

// ====== START ======
boot();