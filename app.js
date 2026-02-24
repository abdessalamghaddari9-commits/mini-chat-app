// app.js (Firebase Auth + Firestore) — MUST be loaded as type="module"

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ Firebase config ديالك
const firebaseConfig = {
  apiKey: "AIzaSyBoeizt2D9twwxyRdUNxLQZPk065Y017F8",
  authDomain: "mini-chat-app-95448.firebaseapp.com",
  projectId: "mini-chat-app-95448",
  storageBucket: "mini-chat-app-95448.firebasestorage.app",
  messagingSenderId: "882567885761",
  appId: "1:882567885761:web:8538107f864cacfbaeb540",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- DOM ----------
const loginScreen = document.getElementById("loginScreen");
const appRoot = document.getElementById("appRoot");

const authTitle = document.getElementById("authTitle");
const authMsg = document.getElementById("authMsg");

const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const goRegisterBtn = document.getElementById("goRegisterBtn");

const registerForm = document.getElementById("registerForm");
const registerName = document.getElementById("registerName");
const registerEmail = document.getElementById("registerEmail");
const registerPassword = document.getElementById("registerPassword");
const goLoginBtn = document.getElementById("goLoginBtn");

const userName = document.getElementById("userName");
const userStatus = document.getElementById("userStatus");
const avatar = document.getElementById("avatar");
const logoutBtn = document.getElementById("logoutBtn");

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

// ---------- Helpers ----------
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

function setAuthMessage(msg = "", isError = false) {
  authMsg.textContent = msg;
  authMsg.style.opacity = msg ? "1" : "0";
  authMsg.style.color = isError ? "#ffb4b4" : "";
}

function showLogin() {
  authTitle.textContent = "Sign in";
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  setAuthMessage("");
}

function showRegister() {
  authTitle.textContent = "Create account";
  loginForm.classList.add("hidden");
  registerForm.classList.remove("hidden");
  setAuthMessage("");
}

// Modal
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

// ---------- Contacts (LocalStorage مؤقتاً) ----------
const LS_CONTACTS = "minichat_contacts";
let contacts = [];
let activeContactId = null;

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

  // Auth required to send
  const u = auth.currentUser;
  messageInput.disabled = !u;
  sendBtn.disabled = !u;

  renderContacts();
}

// ---------- Firestore: Messages (Global room for now) ----------
let unsubMessages = null;

function startMessagesListener() {
  const q = query(collection(db, "chats"), orderBy("createdAt", "asc"));

  if (unsubMessages) unsubMessages();

  unsubMessages = onSnapshot(q, (snap) => {
    messagesEl.innerHTML = "";

    snap.forEach((doc) => {
      const m = doc.data();
      const u = auth.currentUser;

      const mine = u && m.senderUid === u.uid;

      const div = document.createElement("div");
      div.className = "msg " + (mine ? "me" : "them");

      const date =
        m.createdAt?.toDate?.()
          ? m.createdAt.toDate().toLocaleString()
          : "";

      const who = m.senderName || m.senderEmail || "Unknown";

      div.innerHTML = `
        <div class="bubble">
          <div class="text">${escapeHtml(m.text || "")}</div>
          <div class="meta">${escapeHtml(who)}${date ? " • " + escapeHtml(date) : ""}</div>
        </div>
      `;

      messagesEl.appendChild(div);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

async function sendMessage(text) {
  const clean = (text || "").trim();
  if (!clean) return;

  const u = auth.currentUser;
  if (!u) {
    alert("You must be logged in to send messages.");
    return;
  }

  await addDoc(collection(db, "chats"), {
    text: clean,
    createdAt: serverTimestamp(),

    senderUid: u.uid,
    senderEmail: u.email || "",
    senderName: u.displayName || "",
  });
}

// ---------- UI state ----------
function enterApp(user) {
  loginScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");

  userName.textContent = user.displayName || user.email || "User";
  userStatus.textContent = "Online";
  avatar.textContent = initials(user.displayName || user.email || "U");

  loadContacts();
  if (contacts.length === 0) {
    contacts.push({ id: crypto.randomUUID(), name: "General Chat", status: "Public room" });
    saveContacts();
  }

  renderContacts();
  if (!activeContactId) setActiveContact(contacts[0].id);

  startMessagesListener();

  messageInput.disabled = false;
  sendBtn.disabled = false;

  setAuthMessage("");
}

function exitApp() {
  appRoot.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  messageInput.disabled = true;
  sendBtn.disabled = true;

  // stop listener
  if (unsubMessages) unsubMessages();
  unsubMessages = null;

  showLogin();
}

// ---------- Auth events ----------
goRegisterBtn.addEventListener("click", showRegister);
goLoginBtn.addEventListener("click", showLogin);

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthMessage("");

  const name = registerName.value.trim();
  const email = registerEmail.value.trim();
  const pass = registerPassword.value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });

    setAuthMessage("Account created ✅ Logging in...");
    // onAuthStateChanged will handle UI
  } catch (err) {
    setAuthMessage(err?.message || String(err), true);
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthMessage("");

  const email = loginEmail.value.trim();
  const pass = loginPassword.value;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    setAuthMessage("Logged in ✅");
  } catch (err) {
    setAuthMessage(err?.message || String(err), true);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    alert(err?.message || err);
  }
});

// Keep session
onAuthStateChanged(auth, (user) => {
  if (user) enterApp(user);
  else exitApp();
});

// ---------- Chat events ----------
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
cancelBtn.addEventListener("click", hideModal);
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
  messagesEl.innerHTML = "";
});