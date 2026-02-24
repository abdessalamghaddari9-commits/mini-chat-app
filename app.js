// app.js (Firebase + Firestore) — type="module" لازم فـ index.html

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ Firebase config ديالك
const firebaseConfig = {
  apiKey: "AIzaSyBoeizt2D9twwxyRdUNxLQZPk065Y017F8",
  authDomain: "mini-chat-app-95448.firebaseapp.com",
  projectId: "mini-chat-app-95448",
  storageBucket: "mini-chat-app-95448.firebasestorage.app",
  messagingSenderId: "882567885761",
  appId: "1:882567885761:web:8538107f864cacfbaeb540"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --------- DOM ----------
const loginScreen = document.getElementById("loginScreen");
const appRoot = document.getElementById("appRoot");

const profileForm = document.getElementById("profileForm");
const profileName = document.getElementById("profileName");
const profileStatus = document.getElementById("profileStatus");

const userName = document.getElementById("userName");
const userStatus = document.getElementById("userStatus");
const avatar = document.getElementById("avatar");

const messagesEl = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

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
const clearChatBtn = document.getElementById("clearChatBtn");

// --------- Helpers ----------
function initials(name) {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase();
}

function escapeHtml(str) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function showModal() {
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden", "false");
  contactName.focus();
}
function hideModal() {
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden", "true");
  contactForm.reset();
}

// --------- Profile (LocalStorage) ----------
const LS_PROFILE = "minichat_profile";
const LS_CONTACTS = "minichat_contacts";
let profile = null;
let contacts = [];
let activeContactId = null;

// --------- Contacts (UI فقط دابا) ----------
function loadContacts() {
  try {
    contacts = JSON.parse(localStorage.getItem(LS_CONTACTS) || "[]");
  } catch {
    contacts = [];
  }
}
function saveContacts() {
  localStorage.setItem(LS_CONTACTS, JSON.stringify(contacts));
}

function renderContacts() {
  contactsList.innerHTML = "";
  contactsCount.textContent = String(contacts.length);

  if (contacts.length === 0) {
    contactsList.innerHTML = `<div class="hint" style="padding:10px;">No contacts yet. Click “+ New Contact”.</div>`;
    return;
  }

  contacts.forEach((c) => {
    const item = document.createElement("button");
    item.className = "contact " + (c.id === activeContactId ? "active" : "");
    item.type = "button";
    item.innerHTML = `
      <div class="contact-avatar">${escapeHtml(initials(c.name))}</div>
      <div class="contact-meta">
        <div class="contact-name">${escapeHtml(c.name)}</div>
        <div class="contact-sub">${escapeHtml(c.status || "")}</div>
      </div>
    `;
    item.addEventListener("click", () => setActiveContact(c.id));
    contactsList.appendChild(item);
  });
}

function setActiveContact(id) {
  activeContactId = id;
  const c = contacts.find((x) => x.id === id);

  if (!c) return;

  activeAvatar.textContent = initials(c.name);
  activeName.textContent = c.name;
  activeSub.textContent = c.status || "";

  messageInput.disabled = false;
  sendBtn.disabled = false;

  renderContacts();
}

// --------- Firestore: Messages ----------
let unsubMessages = null;

function startMessagesListener() {
  // كنسمعو للـ messages فـ /chats (global chat) ترتيب حسب createdAt
  const q = query(collection(db, "chats"), orderBy("createdAt", "asc"));

  if (unsubMessages) unsubMessages();
  unsubMessages = onSnapshot(q, (snap) => {
    messagesEl.innerHTML = "";

    snap.forEach((doc) => {
      const m = doc.data();
      const mine = (m.sender || "") === (profile?.name || "");
      const div = document.createElement("div");
      div.className = "msg " + (mine ? "me" : "them");

      const date =
        m.createdAt?.toDate?.()
          ? m.createdAt.toDate().toLocaleString()
          : "";

      div.innerHTML = `
        <div class="bubble">
          <div class="text">${escapeHtml(m.text || "")}</div>
          <div class="meta">${escapeHtml(m.sender || "")}${date ? " • " + escapeHtml(date) : ""}</div>
        </div>
      `;
      messagesEl.appendChild(div);
    });

    // scroll لآخر مسج
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

async function sendMessage(text) {
  const clean = (text || "").trim();
  if (!clean) return;

  await addDoc(collection(db, "chats"), {
    text: clean,
    sender: profile?.name || "Anonymous",
    createdAt: serverTimestamp()
  });
}

// --------- App start ----------
function enterApp() {
  loginScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");

  userName.textContent = profile.name;
  userStatus.textContent = profile.status;
  avatar.textContent = initials(profile.name);

  loadContacts();
  renderContacts();

  // لو ماكان حتى contact نديرو واحد default
  if (contacts.length === 0) {
    contacts.push({ id: crypto.randomUUID(), name: "General Chat", status: "Public room" });
    saveContacts();
    renderContacts();
  }

  if (!activeContactId) setActiveContact(contacts[0].id);

  startMessagesListener();
}

// Load profile if exists
try {
  profile = JSON.parse(localStorage.getItem(LS_PROFILE) || "null");
} catch {
  profile = null;
}

if (profile?.name) {
  enterApp();
}

// --------- Events ----------
profileForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const name = profileName.value.trim();
  const status = profileStatus.value.trim();
  if (!name || !status) return;

  profile = { name, status };
  localStorage.setItem(LS_PROFILE, JSON.stringify(profile));

  enterApp();
});

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (messageInput.disabled) return;

  const text = messageInput.value;
  messageInput.value = "";

  try {
    await sendMessage(text);
  } catch (err) {
    alert("Firestore error: " + (err?.message || err));
  }
});

addContactBtn.addEventListener("click", () => showModal());

cancelBtn.addEventListener("click", () => {
  hideModal();
});

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) hideModal();
});

contactForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const name = contactName.value.trim();
  const status = contactStatus.value.trim();
  if (!name || !status) return;

  contacts.push({ id: crypto.randomUUID(), name, status });
  saveContacts();
  hideModal();
  renderContacts();
});

clearChatBtn.addEventListener("click", () => {
  // هنا ما غاديش نمسحو من Firestore باش ما نمسحوش على الناس كاملين
  // غير كنمسحو العرض ديال الصفحة
  messagesEl.innerHTML = "";
});