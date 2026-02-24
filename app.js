// app.js (Firebase Auth + Firestore private 1-1 chats)
// MUST be loaded as type="module" in index.html

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
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  where,
  getDocs,
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
const cancelBtn = document.getElementById("cancelBtn");

// ✅ هنا خاص يكون موجود فـ index.html
const contactEmail = document.getElementById("contactEmail");

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
  contactEmail?.focus();
}
function hideModal() {
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden", "true");
  contactForm.reset();
}

// ---------- Chat State ----------
let activeConversationId = null;
let unsubMessages = null;
let unsubConversations = null;

// cache users data: uid -> {displayName,email,status}
const usersCache = new Map();

function makeConversationId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

async function ensureMyUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const payload = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    status: "Online",
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
  usersCache.set(user.uid, payload);
}

async function getUserByEmail(email) {
  const clean = (email || "").trim().toLowerCase();
  if (!clean) return null;

  const q = query(collection(db, "users"), where("email", "==", clean));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0].data();
  usersCache.set(d.uid, d);
  return d;
}

async function getUserByUid(uid) {
  if (usersCache.has(uid)) return usersCache.get(uid);

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const d = snap.data();
  usersCache.set(uid, d);
  return d;
}

// ---------- Conversations list ----------
function renderConversations(items) {
  contactsList.innerHTML = "";
  contactsCount.textContent = String(items.length);

  if (items.length === 0) {
    contactsList.innerHTML = `<div class="hint" style="padding:10px;">No chats yet. Click “+ New Contact”.</div>`;
    return;
  }

  items.forEach((it) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "contact " + (it.id === activeConversationId ? "active" : "");

    btn.innerHTML = `
      <div class="contact-avatar">${escapeHtml(initials(it.title))}</div>
      <div class="contact-meta">
        <div class="contact-name">${escapeHtml(it.title)}</div>
        <div class="contact-sub">${escapeHtml(it.sub || "")}</div>
      </div>
    `;

    btn.addEventListener("click", () => setActiveConversation(it.id, it));
    contactsList.appendChild(btn);
  });
}

async function listenMyConversations(user) {
  if (unsubConversations) unsubConversations();

  const q = query(collection(db, "conversations"), where("members", "array-contains", user.uid));

  unsubConversations = onSnapshot(q, async (snap) => {
    const items = [];

    for (const d of snap.docs) {
      const conv = d.data();
      const otherUid = (conv.members || []).find((x) => x !== user.uid);
      const other = otherUid ? await getUserByUid(otherUid) : null;

      items.push({
        id: d.id,
        title: other?.displayName || other?.email || "Unknown",
        sub: other?.status || "",
        otherUid,
      });
    }

    // ترتيب بسيط (A-Z)
    items.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    renderConversations(items);

    // اول مرة: دخل لأول شات تلقائيا
    if (!activeConversationId && items[0]) {
      setActiveConversation(items[0].id, items[0]);
    }
  });
}

function setActiveConversation(conversationId, info) {
  activeConversationId = conversationId;

  activeAvatar.textContent = initials(info?.title || "?");
  activeName.textContent = info?.title || "Chat";
  activeSub.textContent = info?.sub || "";

  messageInput.disabled = false;
  sendBtn.disabled = false;

  startMessagesListener(conversationId);
}

// ---------- Messages ----------
function startMessagesListener(conversationId) {
  if (!conversationId) return;

  if (unsubMessages) unsubMessages();

  const msgsRef = collection(db, "conversations", conversationId, "messages");
  const q = query(msgsRef, orderBy("createdAt", "asc"));

  unsubMessages = onSnapshot(q, (snap) => {
    messagesEl.innerHTML = "";

    const me = auth.currentUser;

    snap.forEach((docSnap) => {
      const m = docSnap.data();
      const mine = me && m.senderUid === me.uid;

      const div = document.createElement("div");
      div.className = "msg " + (mine ? "me" : "them");

      const date =
        m.createdAt?.toDate?.()
          ? m.createdAt.toDate().toLocaleString()
          : "";

      div.innerHTML = `
        <div class="bubble">
          <div class="text">${escapeHtml(m.text || "")}</div>
          <div class="meta">${escapeHtml(m.senderName || m.senderEmail || "")}${date ? " • " + escapeHtml(date) : ""}</div>
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
    alert("You must be logged in.");
    return;
  }
  if (!activeConversationId) {
    alert("Select a chat first.");
    return;
  }

  const msgsRef = collection(db, "conversations", activeConversationId, "messages");

  await addDoc(msgsRef, {
    text: clean,
    createdAt: serverTimestamp(),
    senderUid: u.uid,
    senderEmail: u.email || "",
    senderName: u.displayName || "",
  });
}

// ---------- Create conversation with friend email ----------
async function createChatWithEmail(friendEmail) {
  const u = auth.currentUser;
  if (!u) return;

  const friend = await getUserByEmail(friendEmail);
  if (!friend) {
    alert("هاد الإيميل ما لقيتوش فـ Users. خاص صاحبك يسجل فالتطبيق مرة وحدة.");
    return;
  }
  if (friend.uid === u.uid) {
    alert("ما تقدرش تفتح شات مع راسك 😄");
    return;
  }

  const cid = makeConversationId(u.uid, friend.uid);
  const convRef = doc(db, "conversations", cid);

  // create if not exists (safe)
  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) {
    await setDoc(convRef, {
      members: [u.uid, friend.uid],
      createdAt: serverTimestamp(),
    });
  }

  hideModal();
  // listener ديال conversations غادي يجيبها وحدو
}

// ---------- UI state ----------
function enterApp(user) {
  loginScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");

  userName.textContent = user.displayName || user.email || "User";
  userStatus.textContent = "Online";
  avatar.textContent = initials(user.displayName || user.email || "U");

  messageInput.disabled = true;
  sendBtn.disabled = true;

  setAuthMessage("");
}

function exitApp() {
  appRoot.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  messageInput.disabled = true;
  sendBtn.disabled = true;

  if (unsubMessages) unsubMessages();
  unsubMessages = null;

  if (unsubConversations) unsubConversations();
  unsubConversations = null;

  activeConversationId = null;

  showLogin();
}

// ---------- Auth events ----------
goRegisterBtn.addEventListener("click", showRegister);
goLoginBtn.addEventListener("click", showLogin);

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthMessage("");

  const name = registerName.value.trim();
  const email = registerEmail.value.trim().toLowerCase();
  const pass = registerPassword.value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    setAuthMessage("Account created ✅");
  } catch (err) {
    setAuthMessage(err?.message || String(err), true);
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthMessage("");

  const email = loginEmail.value.trim().toLowerCase();
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

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await ensureMyUserDoc(user);
    enterApp(user);
    await listenMyConversations(user);
  } else {
    exitApp();
  }
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

addContactBtn.addEventListener("click", showModal);
cancelBtn.addEventListener("click", hideModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) hideModal();
});

contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = (contactEmail?.value || "").trim().toLowerCase();
  if (!email) return;

  try {
    await createChatWithEmail(email);
  } catch (err) {
    alert(err?.message || err);
  }
});

clearChatBtn.addEventListener("click", () => {
  messagesEl.innerHTML = "";
});