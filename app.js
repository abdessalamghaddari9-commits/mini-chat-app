// MiniChat WhatsApp-like MVP (Auth + Private 1-1 + Unread + Typing + Presence + Seen/Delivered + Images)
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
  query,
  orderBy,
  onSnapshot,
  where,
  getDocs,
  runTransaction,
  increment,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

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
const storage = getStorage(app);

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

const contactsList = document.getElementById("contactsList");
const contactsCount = document.getElementById("contactsCount");
const searchInput = document.getElementById("searchInput");

const activeAvatar = document.getElementById("activeAvatar");
const activeName = document.getElementById("activeName");
const activeSub = document.getElementById("activeSub");
const typingIndicator = document.getElementById("typingIndicator");

const messagesEl = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const imageInput = document.getElementById("imageInput");

const addContactBtn = document.getElementById("addContactBtn");
const modalBackdrop = document.getElementById("modalBackdrop");
const contactForm = document.getElementById("contactForm");
const contactEmail = document.getElementById("contactEmail");
const cancelBtn = document.getElementById("cancelBtn");

const clearChatBtn = document.getElementById("clearChatBtn");

// ---------- Helpers ----------
function initials(name) {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
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
  contactEmail.focus();
}
function hideModal() {
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden", "true");
  contactForm.reset();
}
function makeConversationId(a, b) {
  return [a, b].sort().join("_");
}
function fmtTime(tsMillis) {
  if (!tsMillis) return "";
  const d = new Date(tsMillis);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtLastSeen(userDoc) {
  if (!userDoc) return "—";
  if (userDoc.status === "Online") return "Online";
  if (userDoc.lastActiveMs) return "Last seen: " + new Date(userDoc.lastActiveMs).toLocaleString();
  return "Offline";
}

// ---------- State ----------
let activeConversationId = null;
let activeOtherUid = null;
let activeOtherUser = null;

let unsubConversations = null;
let unsubMessages = null;
let unsubTyping = null;

let typingTimer = null;

const usersCache = new Map(); // uid -> userDoc
let allChatsCache = []; // for search filter

// ---------- Users ----------
async function ensureMyUserDoc(user) {
  const refU = doc(db, "users", user.uid);
  const payload = {
    uid: user.uid,
    email: (user.email || "").toLowerCase(),
    displayName: user.displayName || "",
    status: "Online",
    lastActiveMs: Date.now(),
    updatedAtMs: Date.now(),
  };
  await setDoc(refU, payload, { merge: true });
  usersCache.set(user.uid, payload);
}
async function setMyPresence(status) {
  const u = auth.currentUser;
  if (!u) return;
  await setDoc(doc(db, "users", u.uid), {
    status,
    lastActiveMs: Date.now(),
    updatedAtMs: Date.now(),
  }, { merge: true });
}
async function getUserByUid(uid) {
  if (!uid) return null;
  if (usersCache.has(uid)) return usersCache.get(uid);
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  usersCache.set(uid, d);
  return d;
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

// ---------- Conversations list (WhatsApp style) ----------
function renderChats(items) {
  contactsList.innerHTML = "";
  contactsCount.textContent = String(items.length);

  if (items.length === 0) {
    contactsList.innerHTML = `<div class="hint" style="padding:10px;">No chats yet. Click “+ New Chat”.</div>`;
    return;
  }

  for (const it of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "contact " + (it.id === activeConversationId ? "active" : "");

    const unread = it.unread > 0 ? `<span class="unread-badge">${it.unread}</span>` : "";

    btn.innerHTML = `
      <div class="contact-avatar">${escapeHtml(initials(it.title))}</div>
      <div class="contact-meta">
        <div class="contact-row">
          <div class="contact-name">${escapeHtml(it.title)}</div>
          <div class="contact-time">${escapeHtml(it.time || "")}</div>
        </div>
        <div class="contact-row">
          <div class="contact-sub">${escapeHtml(it.preview || it.sub || "")}</div>
          ${unread}
        </div>
      </div>
    `;

    btn.addEventListener("click", () => openConversation(it.id, it.otherUid));
    contactsList.appendChild(btn);
  }
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

      const unread = Number(conv.unread?.[user.uid] || 0);
      const lastAtMs = Number(conv.lastMessageAtMs || 0);

      items.push({
        id: d.id,
        otherUid,
        title: other?.displayName || other?.email || "Unknown",
        sub: other?.status || "",
        preview: conv.lastMessage || "",
        time: lastAtMs ? fmtTime(lastAtMs) : "",
        unread,
        sortMs: lastAtMs,
      });
    }

    items.sort((a, b) => (b.sortMs || 0) - (a.sortMs || 0));
    allChatsCache = items;

    applySearchFilter();
    if (!activeConversationId && items[0]) openConversation(items[0].id, items[0].otherUid);
  });
}

function applySearchFilter(){
  const term = (searchInput.value || "").trim().toLowerCase();
  if (!term) return renderChats(allChatsCache);

  const filtered = allChatsCache.filter(x =>
    (x.title || "").toLowerCase().includes(term) ||
    (x.preview || "").toLowerCase().includes(term)
  );
  renderChats(filtered);
}

// ---------- Open conversation ----------
async function openConversation(convId, otherUid) {
  activeConversationId = convId;
  activeOtherUid = otherUid;

  activeOtherUser = await getUserByUid(otherUid);

  activeAvatar.textContent = initials(activeOtherUser?.displayName || activeOtherUser?.email || "?");
  activeName.textContent = activeOtherUser?.displayName || activeOtherUser?.email || "Chat";
  activeSub.textContent = fmtLastSeen(activeOtherUser);
  typingIndicator.classList.add("hidden");

  messageInput.disabled = false;
  sendBtn.disabled = false;

  await markRead(convId);
  listenTyping(convId, otherUid);
  listenMessages(convId);
}

// ---------- Read / Delivered / Seen ----------
async function markRead(convId) {
  const u = auth.currentUser;
  if (!u || !convId) return;

  const convRef = doc(db, "conversations", convId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(convRef);
    if (!snap.exists()) return;
    tx.update(convRef, {
      [`unread.${u.uid}`]: 0,
      [`lastSeenAtMs.${u.uid}`]: Date.now(),
    });
  });
}

// ---------- Typing ----------
async function setTyping(isTyping) {
  const u = auth.currentUser;
  if (!u || !activeConversationId) return;
  const tRef = doc(db, "conversations", activeConversationId, "typing", u.uid);
  if (isTyping) {
    await setDoc(tRef, { typing: true, updatedAtMs: Date.now() }, { merge: true });
  } else {
    // delete by overwriting with false (rules allow update)
    await setDoc(tRef, { typing: false, updatedAtMs: Date.now() }, { merge: true });
  }
}

function listenTyping(convId, otherUid) {
  if (unsubTyping) unsubTyping();
  if (!convId || !otherUid) return;

  const tRef = doc(db, "conversations", convId, "typing", otherUid);
  unsubTyping = onSnapshot(tRef, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    const isTyping = !!data?.typing;
    if (isTyping) typingIndicator.classList.remove("hidden");
    else typingIndicator.classList.add("hidden");
  });
}

// ---------- Messages ----------
function ticksForMessage(msg, convData) {
  // delivered: if other has lastDeliveredAtMs >= msg.createdAtMs
  // seen: if other has lastSeenAtMs >= msg.createdAtMs
  const other = activeOtherUid;
  const created = msg.createdAtMs || 0;

  const deliveredAt = Number(convData?.lastDeliveredAtMs?.[other] || 0);
  const seenAt = Number(convData?.lastSeenAtMs?.[other] || 0);

  if (seenAt >= created) return "✓✓";       // seen
  if (deliveredAt >= created) return "✓✓";  // delivered (we show same double)
  return "✓";                               // sent
}

function listenMessages(convId) {
  if (unsubMessages) unsubMessages();

  const convRef = doc(db, "conversations", convId);
  const msgsRef = collection(db, "conversations", convId, "messages");
  const q = query(msgsRef, orderBy("createdAtMs", "asc"));

  unsubMessages = onSnapshot(q, async (snap) => {
    messagesEl.innerHTML = "";

    const convSnap = await getDoc(convRef);
    const convData = convSnap.exists() ? convSnap.data() : {};

    const me = auth.currentUser;
    const clearedAt = Number(convData?.clearedAtMs?.[me?.uid] || 0);

    // mark delivered for me (when I open chat, I delivered everything)
    await setDoc(convRef, {
      lastDeliveredAtMs: { [me.uid]: Date.now() }
    }, { merge: true });

    for (const d of snap.docs) {
      const m = d.data();
      if (clearedAt && (m.createdAtMs || 0) < clearedAt) continue;

      const mine = me && m.senderUid === me.uid;
      const div = document.createElement("div");
      div.className = "msg " + (mine ? "me" : "them");

      const date = m.createdAtMs ? new Date(m.createdAtMs).toLocaleString() : "";
      const ticks = mine ? ticksForMessage(m, convData) : "";

      let body = "";
      if (m.type === "image" && m.imageUrl) {
        body = `<img class="img" src="${escapeHtml(m.imageUrl)}" alt="image" />`;
      } else {
        body = `<div class="text">${escapeHtml(m.text || "")}</div>`;
      }

      div.innerHTML = `
        <div class="bubble">
          ${body}
          <div class="meta">
            <span>${escapeHtml(m.senderName || m.senderEmail || "")}${date ? " • " + escapeHtml(date) : ""}</span>
            <span class="ticks">${escapeHtml(ticks)}</span>
          </div>
        </div>
      `;

      messagesEl.appendChild(div);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;

    // mark seen when reading
    await setDoc(convRef, {
      lastSeenAtMs: { [me.uid]: Date.now() }
    }, { merge: true });

    // update header presence
    const latestOther = await getUserByUid(activeOtherUid);
    if (latestOther) activeSub.textContent = fmtLastSeen(latestOther);
  });
}

async function sendTextMessage(text) {
  const clean = (text || "").trim();
  if (!clean) return;

  const u = auth.currentUser;
  if (!u || !activeConversationId || !activeOtherUid) return;

  const convRef = doc(db, "conversations", activeConversationId);
  const msgsRef = collection(db, "conversations", activeConversationId, "messages");
  const now = Date.now();

  await runTransaction(db, async (tx) => {
    const convSnap = await tx.get(convRef);
    if (!convSnap.exists()) throw new Error("Conversation not found.");

    tx.set(doc(msgsRef), {
      type: "text",
      text: clean,
      createdAtMs: now,
      createdAt: new Date(now),
      senderUid: u.uid,
      senderEmail: (u.email || "").toLowerCase(),
      senderName: u.displayName || "",
    });

    tx.update(convRef, {
      lastMessage: clean,
      lastMessageAtMs: now,
      lastSenderUid: u.uid,
      [`unread.${activeOtherUid}`]: increment(1),
      [`unread.${u.uid}`]: 0,
    });
  });
}

async function sendImageMessage(file) {
  const u = auth.currentUser;
  if (!u || !activeConversationId || !activeOtherUid || !file) return;

  const convId = activeConversationId;
  const now = Date.now();

  // upload to Storage
  const path = `conversations/${convId}/${u.uid}_${now}_${file.name}`;
  const r = ref(storage, path);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);

  const convRef = doc(db, "conversations", convId);
  const msgsRef = collection(db, "conversations", convId, "messages");

  await runTransaction(db, async (tx) => {
    const convSnap = await tx.get(convRef);
    if (!convSnap.exists()) throw new Error("Conversation not found.");

    tx.set(doc(msgsRef), {
      type: "image",
      imageUrl: url,
      text: "",
      createdAtMs: now,
      createdAt: new Date(now),
      senderUid: u.uid,
      senderEmail: (u.email || "").toLowerCase(),
      senderName: u.displayName || "",
    });

    tx.update(convRef, {
      lastMessage: "📷 Photo",
      lastMessageAtMs: now,
      lastSenderUid: u.uid,
      [`unread.${activeOtherUid}`]: increment(1),
      [`unread.${u.uid}`]: 0,
    });
  });
}

// ---------- Create chat with friend email ----------
async function createChatWithEmail(email) {
  const u = auth.currentUser;
  const friend = await getUserByEmail(email);
  if (!friend) {
    alert("هاد الإيميل ما لقيتوش. خاص صاحبك يسجل فالتطبيق.");
    return;
  }
  if (friend.uid === u.uid) {
    alert("ما تقدرش تفتح شات مع راسك 😄");
    return;
  }

  const cid = makeConversationId(u.uid, friend.uid);
  const convRef = doc(db, "conversations", cid);

  const snap = await getDoc(convRef);
  if (!snap.exists()) {
    await setDoc(convRef, {
      members: [u.uid, friend.uid],
      createdAtMs: Date.now(),
      lastMessage: "",
      lastMessageAtMs: 0,
      unread: { [u.uid]: 0, [friend.uid]: 0 },
      lastDeliveredAtMs: {},
      lastSeenAtMs: {},
      clearedAtMs: {},
    });
  }

  hideModal();
  openConversation(cid, friend.uid);
}

// ---------- Clear chat (for me only) ----------
async function clearChatForMe() {
  const u = auth.currentUser;
  if (!u || !activeConversationId) return;

  await setDoc(doc(db, "conversations", activeConversationId), {
    clearedAtMs: { [u.uid]: Date.now() }
  }, { merge: true });

  messagesEl.innerHTML = "";
}

// ---------- App UI state ----------
function enterApp(user) {
  loginScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");

  userName.textContent = user.displayName || user.email || "User";
  userStatus.textContent = "Online";
  avatar.textContent = initials(user.displayName || user.email || "U");

  messageInput.disabled = true;
  sendBtn.disabled = true;
  activeConversationId = null;
  activeOtherUid = null;

  setAuthMessage("");
}
function exitApp() {
  appRoot.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  if (unsubConversations) unsubConversations();
  if (unsubMessages) unsubMessages();
  if (unsubTyping) unsubTyping();

  unsubConversations = null;
  unsubMessages = null;
  unsubTyping = null;

  activeConversationId = null;
  activeOtherUid = null;

  showLogin();
}

// ---------- Presence hooks ----------
function setupPresenceHooks(){
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setMyPresence("Online");
    else setMyPresence("Offline");
  });
  window.addEventListener("beforeunload", () => {
    setMyPresence("Offline");
  });
}

// ---------- Events ----------
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
    await ensureMyUserDoc(user);
    await setMyPresence("Online");
    setupPresenceHooks();
    enterApp(user);
    await listenMyConversations(user);
  } else {
    exitApp();
  }
});

addContactBtn.addEventListener("click", showModal);
cancelBtn.addEventListener("click", hideModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) hideModal();
});

contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = contactEmail.value.trim().toLowerCase();
  if (!email) return;
  try {
    await createChatWithEmail(email);
  } catch (err) {
    alert(err?.message || err);
  }
});

searchInput.addEventListener("input", applySearchFilter);

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (messageInput.disabled) return;

  const text = messageInput.value;
  messageInput.value = "";

  try {
    await sendTextMessage(text);
  } catch (err) {
    alert(err?.message || err);
  } finally {
    setTyping(false);
  }
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    messageForm.requestSubmit();
  }
});

messageInput.addEventListener("input", () => {
  if (!activeConversationId) return;
  setTyping(true);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => setTyping(false), 900);
});

imageInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;

  try {
    await sendImageMessage(file);
  } catch (err) {
    alert(err?.message || err);
  }
});

clearChatBtn.addEventListener("click", async () => {
  try {
    await clearChatForMe();
  } catch (err) {
    alert(err?.message || err);
  }
});