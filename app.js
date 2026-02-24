// app.js (Firebase + Firestore real-time) ✅

// ---------- Firebase imports (Web SDK v10) ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// ---------- Your Firebase config ----------
const firebaseConfig = {
  apiKey: "AIzaSyBoeizt2D9twwxyRdUNxLQZPk065Y017F8",
  authDomain: "mini-chat-app-95448.firebaseapp.com",
  projectId: "mini-chat-app-95448",
  storageBucket: "mini-chat-app-95448.firebasestorage.app",
  messagingSenderId: "882567885761",
  appId: "1:882567885761:web:8538107f864cacfbaeb540"
};

// ---------- Init ----------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---------- DOM ----------
const loginScreen = document.getElementById("loginScreen");
const appRoot = document.getElementById("appRoot");

const profileForm = document.getElementById("profileForm");
const profileName = document.getElementById("profileName");
const profileStatus = document.getElementById("profileStatus");

const avatar = document.getElementById("avatar");
const userName = document.getElementById("userName");
const userStatus = document.getElementById("userStatus");

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

const messagesBox = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const clearChatBtn = document.getElementById("clearChatBtn");

// ---------- Helpers ----------
function $(id) { return document.getElementById(id); }

function safeText(str) {
  return (str || "").toString().trim();
}

function initials(name) {
  const n = safeText(name);
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function openModal() {
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden", "false");
  contactName.value = "";
  contactStatus.value = "";
  contactName.focus();
}

function closeModal() {
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden", "true");
}

function scrollMessagesToBottom() {
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

// ---------- State ----------
let me = null; // { uid, name, status }
let selectedContact = null; // { id, name, status }
let unsubMessages = null; // onSnapshot unsubscribe

// ---------- Firestore paths ----------
function userDocRef(uid) {
  return doc(db, "users", uid);
}
function contactsColRef(uid) {
  return collection(db, "users", uid, "contacts");
}
function messagesColRef(uid) {
  return collection(db, "users", uid, "messages");
}

// Conversation id = stable between 2 users
function convoId(a, b) {
  return [a, b].sort().join("__");
}

// ---------- Auth simulation (Email/Password enabled but UI simple) ----------
// We keep it simple: create/read a user profile doc by a generated uid stored in localStorage.
function getOrCreateUid() {
  const key = "minichat_uid";
  let uid = localStorage.getItem(key);
  if (!uid) {
    uid = "u_" + crypto.randomUUID();
    localStorage.setItem(key, uid);
  }
  return uid;
}

// ---------- UI render ----------
function renderMe() {
  userName.textContent = me?.name || "User";
  userStatus.textContent = me?.status || "Online";
  avatar.textContent = initials(me?.name);
}

function renderContacts(contacts) {
  contactsList.innerHTML = "";

  contactsCount.textContent = String(contacts.length);

  if (contacts.length === 0) {
    const empty = document.createElement("div");
    empty.style.padding = "12px";
    empty.style.opacity = "0.7";
    empty.textContent = "No contacts yet. Click “+ New Contact”.";
    contactsList.appendChild(empty);
    return;
  }

  contacts.forEach(c => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "contact-item";
    item.style.width = "100%";
    item.style.textAlign = "left";
    item.style.border = "0";
    item.style.background = "transparent";
    item.style.padding = "10px";
    item.style.cursor = "pointer";

    item.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;">
        <div class="chat-avatar" style="width:36px;height:36px;display:grid;place-items:center;border-radius:10px;">
          ${initials(c.name)}
        </div>
        <div style="min-width:0;">
          <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.name}</div>
          <div style="opacity:.75;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.status || ""}</div>
        </div>
      </div>
    `;

    item.addEventListener("click", () => selectContact(c));
    contactsList.appendChild(item);
  });
}

function setChatHeader(contact) {
  if (!contact) {
    activeAvatar.textContent = "?";
    activeName.textContent = "Select a contact";
    activeSub.textContent = "Start chatting";
    messageInput.disabled = true;
    sendBtn.disabled = true;
    return;
  }
  activeAvatar.textContent = initials(contact.name);
  activeName.textContent = contact.name;
  activeSub.textContent = contact.status || "";
  messageInput.disabled = false;
  sendBtn.disabled = false;
}

function renderMessages(list) {
  messagesBox.innerHTML = "";
  list.forEach(m => {
    const bubble = document.createElement("div");
    const mine = m.from === me.uid;

    bubble.className = "bubble " + (mine ? "mine" : "theirs");
    bubble.style.maxWidth = "78%";
    bubble.style.margin = mine ? "8px 0 8px auto" : "8px auto 8px 0";
    bubble.style.padding = "10px 12px";
    bubble.style.borderRadius = "14px";
    bubble.style.whiteSpace = "pre-wrap";
    bubble.style.wordBreak = "break-word";

    bubble.textContent = m.text || "";
    messagesBox.appendChild(bubble);
  });

  scrollMessagesToBottom();
}

// ---------- Data (Firestore) ----------
async function saveMyProfile(name, status) {
  const uid = getOrCreateUid();
  const payload = {
    uid,
    name,
    status,
    updatedAt: serverTimestamp()
  };
  await setDoc(userDocRef(uid), payload, { merge: true });
  me = { uid, name, status };
}

async function loadMyProfile() {
  const uid = getOrCreateUid();
  const snap = await getDoc(userDocRef(uid));
  if (snap.exists()) {
    const data = snap.data();
    me = {
      uid,
      name: data.name || "User",
      status: data.status || "Online"
    };
    return true;
  }
  return false;
}

function listenContacts() {
  const qy = query(contactsColRef(me.uid), orderBy("createdAt", "desc"));
  return onSnapshot(qy, (snap) => {
    const contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderContacts(contacts);
  });
}

async function addContact(name, status) {
  const payload = {
    name,
    status,
    createdAt: serverTimestamp()
  };
  await addDoc(contactsColRef(me.uid), payload);
}

// Messages are stored in: users/{uid}/messages with fields convo, from, to, text, createdAt
async function sendMessage(toContact, text) {
  const payload = {
    convo: convoId(me.uid, toContact.id),
    from: me.uid,
    to: toContact.id,
    text,
    createdAt: serverTimestamp()
  };
  await addDoc(messagesColRef(me.uid), payload);
  // Also store a copy for the contact if you want cross-user real app (needs real auth).
  // For now this project is single-user demo + real-time within your own account.
}

function listenMessages(contact) {
  if (unsubMessages) unsubMessages();

  const qy = query(
    messagesColRef(me.uid),
    where("convo", "==", convoId(me.uid, contact.id)),
    orderBy("createdAt", "asc")
  );

  unsubMessages = onSnapshot(qy, (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMessages(msgs);
  });
}

async function clearChat(contact) {
  const qy = query(
    messagesColRef(me.uid),
    where("convo", "==", convoId(me.uid, contact.id))
  );
  const snap = await getDocs(qy);
  const deletions = snap.docs.map(d => deleteDoc(d.ref));
  await Promise.all(deletions);
}

// ---------- Contact selection ----------
function selectContact(c) {
  selectedContact = c;
  setChatHeader(c);
  listenMessages(c);
}

// ---------- Events ----------
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = safeText(profileName.value);
  const status = safeText(profileStatus.value) || "Online";
  if (!name) return;

  await saveMyProfile(name, status);

  renderMe();
  hide(loginScreen);
  show(appRoot);

  // start listeners
  listenContacts();
  setChatHeader(null);
});

addContactBtn.addEventListener("click", () => openModal());

cancelBtn.addEventListener("click", () => {
  closeModal();
});

// close modal if click outside
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = safeText(contactName.value);
  const status = safeText(contactStatus.value) || "Online";
  if (!name) return;

  await addContact(name, status);
  closeModal();
});

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedContact) return;

  const text = safeText(messageInput.value);
  if (!text) return;

  messageInput.value = "";
  await sendMessage(selectedContact, text);
});

clearChatBtn.addEventListener("click", async () => {
  if (!selectedContact) return;
  if (!confirm("Clear chat with this contact?")) return;
  await clearChat(selectedContact);
});

// ---------- Boot ----------
(async function init() {
  const hasProfile = await loadMyProfile();

  if (hasProfile) {
    renderMe();
    hide(loginScreen);
    show(appRoot);

    listenContacts();
    setChatHeader(null);
  } else {
    // show login
    show(loginScreen);
    hide(appRoot);
  }
})();