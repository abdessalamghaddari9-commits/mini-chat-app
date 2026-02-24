// app.js — Firebase Auth + Firestore (WhatsApp-like simple room)
// IMPORTANT: index.html لازم فيه: <script type="module" src="app.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  getDocs
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
const auth = getAuth(app);
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

// --------- Profile + Contacts (LocalStorage) ----------
const LS_PROFILE = "minichat_profile";
const LS_CONTACTS = "minichat_contacts";

let profile = null;
let contacts = [];
let activeContactId = null;

// --------- Contacts ----------
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

// --------- Firestore: Messages (global room: /chats) ----------
let unsubMessages = null;

function startMessagesListener() {
  const q = query(collection(db, "chats"), orderBy("createdAt", "asc"));

  if (unsubMessages) unsubMessages();
  unsubMessages = onSnapshot(q, (snap) => {
    messagesEl.innerHTML = "";

    snap.forEach((d) => {
      const m = d.data();
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

    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

async function sendMessage(text) {
  const clean = (text || "").trim();
  if (!clean) return;

  await addDoc(collection(db, "chats"), {
    text: clean,
    sender: profile?.name || auth.currentUser?.email || "Anonymous",
    createdAt: serverTimestamp()
  });
}

// --------- Auth Helpers ----------
// حنا غادي نديرو Sign-in حقيقي ب Email/Password لكن UI ديالك فيه Name/Status
// ✅ كنحوّلو Name ل Email وهمي باش تخدم Auth بلا ما نبدلو الواجهة دابا:
// مثال: Abdessalam => abdessalam@minichat.local
function nameToEmail(name) {
  const clean = (name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
  return `${clean || "user"}@minichat.local`;
}

// password ثابت باش نجربو (تقدر تبدلو من بعد)
const DEFAULT_PASS = "12345678";

// حاول نسجل، إذا كان مسجل من قبل ندير login
async function signupOrLoginByName(name) {
  const email = nameToEmail(name);

  try {
    await createUserWithEmailAndPassword(auth, email, DEFAULT_PASS);
  } catch (e) {
    // إذا كان موجود من قبل
    if (e?.code === "auth/email-already-in-use") {
      await signInWithEmailAndPassword(auth, email, DEFAULT_PASS);
    } else {
      throw e;
    }
  }
}

// --------- App Start ----------
function enterApp() {
  loginScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");

  userName.textContent = profile.name;
  userStatus.textContent = profile.status;
  avatar.textContent = initials(profile.name);

  loadContacts();
  renderContacts();

  if (contacts.length === 0) {
    contacts.push({ id: crypto.randomUUID(), name: "General Chat", status: "Public room" });
    saveContacts();
    renderContacts();
  }

  if (!activeContactId) setActiveContact(contacts[0].id);

  startMessagesListener();
}

// Load profile from LocalStorage
try {
  profile = JSON.parse(localStorage.getItem(LS_PROFILE) || "null");
} catch {
  profile = null;
}

// Auth state listener
onAuthStateChanged(auth, (user) => {
  // إذا user موجود و profile موجود -> دخل
  if (user && profile?.name) {
    enterApp();
    return;
  }

  // إذا ماكاينش user -> رجع ل login screen
  appRoot.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  // تعطيل الإرسال حتى تختار contact و تدخل
  messageInput.disabled = true;
  sendBtn.disabled = true;
});

// --------- Events ----------
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = profileName.value.trim();
  const status = profileStatus.value.trim();
  if (!name || !status) return;

  // خزّن profile
  profile = { name, status };
  localStorage.setItem(LS_PROFILE, JSON.stringify(profile));

  // ✅ دير Auth حقيقي (signup/login)
  try {
    await signupOrLoginByName(name);
  } catch (err) {
    alert("Auth error: " + (err?.message || err));
  }
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

// Clear chat: نحيدو الرسائل من Firestore (اختياري)
// إذا بغيتي غير يمسح من الشاشة فقط، قولّي ونبدلوها
clearChatBtn.addEventListener("click", async () => {
  const ok = confirm("واش بغيتي تمسح جميع الرسائل من Firestore؟ (غادي تتحيد عند الناس كاملين)");
  if (!ok) return;

  try {
    const snap = await getDocs(collection(db, "chats"));
    const promises = [];
    snap.forEach((d) => promises.push(deleteDoc(doc(db, "chats", d.id))));
    await Promise.all(promises);
  } catch (err) {
    alert("Delete error: " + (err?.message || err));
  }
});

// OPTIONAL: إذا بغيتي زر logout فـ UI من بعد، نقدر نزيدوه
window.minichatLogout = async function () {
  try {
    await signOut(auth);
  } catch (err) {
    alert("Logout error: " + (err?.message || err));
  }
};