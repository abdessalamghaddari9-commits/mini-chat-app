// app.js — Firebase Auth + Firestore (private 1-1 WhatsApp-like basics)
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
  updateDoc,
  runTransaction,
  increment,
  deleteDoc,
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
const contactEmail = document.getElementById("contactEmail");

const contactsList = document.getElementById("contactsList");
const contactsCount = document.getElementById("contactsCount");

const activeAvatar = document.getElementById("activeAvatar");
const activeName = document.getElementById("activeName");
const activeSub = document.getElementById("activeSub");
const typingIndicator = document.getElementById("typingIndicator");
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
function timeShort(ts) {
  try {
    const d = ts?.toDate?.() ? ts.toDate() : null;
    if (!d) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
function lastSeenText(userDoc) {
  if (!userDoc) return "";
  if (userDoc.status === "Online") return "Online";
  if (userDoc.lastActive?.toDate) {
    return "Last seen: " + userDoc.lastActive.toDate().toLocaleString();
  }
  return "Offline";
}

// ---------- State ----------
let activeConversationId = null;
let activeOtherUid = null;

let unsubMessages = null;
let unsubConversations = null;
let unsubTyping = null;

const usersCache = new Map(); // uid -> userDoc
let myUid = null;

// ---------- IDs / helpers ----------
function makeConversationId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

// ---------- Users collection ----------
async function ensureMyUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const payload = {
    uid: user.uid,
    email: (user.email || "").toLowerCase(),
    displayName: user.displayName || "",
    status: "Online",
    lastActive: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
  usersCache.set(user.uid, payload);
}

async function setMyPresence(status) {
  const u = auth.currentUser;
  if (!u) return;
  const ref = doc(db, "users", u.uid);
  await setDoc(
    ref,
    { status, lastActive: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true }
  );
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
  if (!uid) return null;
  if (usersCache.has(uid)) return usersCache.get(uid);

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const d = snap.data();
  usersCache.set(uid, d);
  return d;
}

// ---------- UI: conversations list ----------
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

    const unreadHtml = it.unread > 0
      ? `<span class="unread-badge">${it.unread}</span>`
      : "";

    btn.innerHTML = `
      <div class="contact-avatar">${escapeHtml(initials(it.title))}</div>
      <div class="contact-meta">
        <div class="contact-row">
          <div class="contact-name">${escapeHtml(it.title)}</div>
          <div class="contact-time">${escapeHtml(it.time || "")}</div>
        </div>
        <div class="contact-row">
          <div class="contact-sub">${escapeHtml(it.sub || "")}</div>
          ${unreadHtml}
        </div>
      </div>
    `;

    btn.addEventListener("click", () => setActiveConversation(it.id, it.otherUid, it));
    contactsList.appendChild(btn);
  });
}

async function listenMyConversations(user) {
  if (unsubConversations) unsubConversations();

  const q = query(
    collection(db, "conversations"),
    where("members", "array-contains", user.uid)
  );

  unsubConversations = onSnapshot(q, async (snap) => {
    const items = [];

    for (const d of snap.docs) {
      const conv = d.data();
      const otherUid = (conv.members || []).find((x) => x !== user.uid);

      const other = otherUid ? await getUserByUid(otherUid) : null;

      const unread = Number(conv.unread?.[user.uid] || 0);
      const lastMsg = conv.lastMessage || "";
      const lastAt = conv.lastMessageAt || null;

      items.push({
        id: d.id,
        otherUid,
        title: other?.displayName || other?.email || "Unknown",
        sub: lastMsg ? lastMsg : (other?.status || ""),
        time: lastAt ? timeShort(lastAt) : "",
        unread,
        lastAtSort: lastAt?.toMillis ? lastAt.toMillis() : 0,
      });
    }

    // sort: latest message desc
    items.sort((a, b) => (b.lastAtSort || 0) - (a.lastAtSort || 0));

    renderConversations(items);

    // Auto-open first chat
    if (!activeConversationId && items[0]) {
      setActiveConversation(items[0].id, items[0].otherUid, items[0]);
    }
  });
}

async function setActiveConversation(conversationId, otherUid, info) {
  activeConversationId = conversationId;
  activeOtherUid = otherUid;

  const other = otherUid ? await getUserByUid(otherUid) : null;

  activeAvatar.textContent = initials(info?.title || other?.displayName || other?.email || "?");
  activeName.textContent = info?.title || other?.displayName || other?.email || "Chat";
  activeSub.textContent = lastSeenText(other);
  typingIndicator?.classList.add("hidden");

  messageInput.disabled = false;
  sendBtn.disabled = false;

  await markConversationRead(conversationId);

  startTypingListener(conversationId, otherUid);
  startMessagesListener(conversationId);
}

// ---------- Read/Unread + Clear Chat (for me) ----------
async function markConversationRead(conversationId) {
  const u = auth.currentUser;
  if (!u || !conversationId) return;

  const convRef = doc(db, "conversations", conversationId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(convRef);
    if (!snap.exists()) return;

    tx.update(convRef, {
      [`unread.${u.uid}`]: 0,
      [`lastReadAt.${u.uid}`]: serverTimestamp(),
    });
  });
}

async function clearChatForMe(conversationId) {
  const u = auth.currentUser;
  if (!u || !conversationId) return;

  const convRef = doc(db, "conversations", conversationId);
  await updateDoc(convRef, {
    [`clearedAt.${u.uid}`]: serverTimestamp(),
  });
}

// ---------- Typing ----------
let typingTimer = null;

async function setTyping(isTyping) {
  const u = auth.currentUser;
  if (!u || !activeConversationId) return;

  const typingRef = doc(db, "conversations", activeConversationId, "typing", u.uid);

  if (isTyping) {
    await setDoc(
      typingRef,
      { typing: true, updatedAt: serverTimestamp(), uid: u.uid },
      { merge: true }
    );
  } else {
    // easiest: delete doc
    try { await deleteDoc(typingRef); } catch {}
  }
}

function startTypingListener(conversationId, otherUid) {
  if (unsubTyping) unsubTyping();
  if (!conversationId || !otherUid) return;

  const otherTypingRef = doc(db, "conversations", conversationId, "typing", otherUid);
  unsubTyping = onSnapshot(otherTypingRef, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    const isTyping = !!data?.typing;
    if (!typingIndicator) return;

    if (isTyping) typingIndicator.classList.remove("hidden");
    else typingIndicator.classList.add("hidden");
  });
}

// ---------- Messages ----------
function startMessagesListener(conversationId) {
  if (!conversationId) return;

  if (unsubMessages) unsubMessages();

  const msgsRef = collection(db, "conversations", conversationId, "messages");
  const q = query(msgsRef, orderBy("createdAt", "asc"));

  const convRef = doc(db, "conversations", conversationId);

  unsubMessages = onSnapshot(q, async (snap) => {
    messagesEl.innerHTML = "";

    const me = auth.currentUser;

    // get clearedAt for me (to hide old msgs only for me)
    let clearedAtMillis = 0;
    try {
      const convSnap = await getDoc(convRef);
      const conv = convSnap.exists() ? convSnap.data() : null;
      const clearedAt = conv?.clearedAt?.[me?.uid];
      if (clearedAt?.toMillis) clearedAtMillis = clearedAt.toMillis();
    } catch {}

    snap.forEach((docSnap) => {
      const m = docSnap.data();
      const createdMillis = m.createdAt?.toMillis ? m.createdAt.toMillis() : 0;

      // hide messages older than my clearedAt
      if (clearedAtMillis && createdMillis && createdMillis < clearedAtMillis) return;

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
  if (!activeConversationId || !activeOtherUid) {
    alert("Select a chat first.");
    return;
  }

  const convRef = doc(db, "conversations", activeConversationId);
  const msgsRef = collection(db, "conversations", activeConversationId, "messages");

  await runTransaction(db, async (tx) => {
    const convSnap = await tx.get(convRef);
    if (!convSnap.exists()) throw new Error("Conversation not found.");

    // add message
    const msgRef = doc(msgsRef); // auto id
    tx.set(msgRef, {
      text: clean,
      createdAt: serverTimestamp(),
      senderUid: u.uid,
      senderEmail: (u.email || "").toLowerCase(),
      senderName: u.displayName || "",
    });

    // update conversation metadata + unread counts
    tx.update(convRef, {
      lastMessage: clean,
      lastMessageAt: serverTimestamp(),
      lastSenderUid: u.uid,
      [`unread.${activeOtherUid}`]: increment(1),
      [`unread.${u.uid}`]: 0,
      [`lastReadAt.${u.uid}`]: serverTimestamp(),
    });
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

  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) {
    await setDoc(convRef, {
      members: [u.uid, friend.uid],
      createdAt: serverTimestamp(),
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      unread: { [u.uid]: 0, [friend.uid]: 0 },
      lastReadAt: { [u.uid]: serverTimestamp(), [friend.uid]: serverTimestamp() },
      clearedAt: {},
    });
  }

  hideModal();
  // list listener will show it automatically
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

  if (unsubTyping) unsubTyping();
  unsubTyping = null;

  activeConversationId = null;
  activeOtherUid = null;

  showLogin();
}

// ---------- Presence: online/offline simple ----------
function setupPresenceHooks() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setMyPresence("Online");
    else setMyPresence("Offline");
  });
  window.addEventListener("beforeunload", () => {
    // best effort
    setMyPresence("Offline");
  });
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
    await ensureMyUserDoc(cred.user);
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
    await setMyPresence("Offline");
    await signOut(auth);
  } catch (err) {
    alert(err?.message || err);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    myUid = user.uid;

    await ensureMyUserDoc(user);
    await setMyPresence("Online");
    setupPresenceHooks();

    enterApp(user);
    await listenMyConversations(user);
  } else {
    myUid = null;
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
  } finally {
    // stop typing quickly
    setTyping(false);
  }
});

// Enter send + Shift+Enter new line (for input: we simulate by preventing submit if shift)
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    messageForm.requestSubmit();
  }
});

// typing detection
messageInput.addEventListener("input", () => {
  if (!activeConversationId) return;

  setTyping(true);

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    setTyping(false);
  }, 900);
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

clearChatBtn.addEventListener("click", async () => {
  if (!activeConversationId) return;
  try {
    await clearChatForMe(activeConversationId);
    messagesEl.innerHTML = "";
  } catch (err) {
    alert(err?.message || err);
  }
});