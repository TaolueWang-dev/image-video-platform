const CACHE_KEY = "astral-forge-console-cache";
const MAX_RECENT_ITEMS = 6;
const MAX_THREAD_ITEMS = 18;
const MAX_SESSION_ITEMS = 100;
const IMAGE_PRICE_PER_OUTPUT_CENTS = 15;
const VIDEO_PRICE_PER_SECOND_CENTS = 150;
const PROTECTED_PAGES = new Set(["home", "image", "video", "recharge", "profile", "admin"]);
const ADMIN_ONLY_PAGES = new Set(["admin"]);

const state = {
  config: {
    imageModels: [],
    defaultImageModel: "",
  },
  auth: {
    authenticated: false,
    session: null,
    user: null,
    admin: null,
    subjectType: "",
    email: "",
    role: "",
  },
  loginMode: "password",
  registerCodeSent: false,
  videoPollTimer: null,
  currentTaskId: null,
  recentOrders: [],
  recentVideoTasks: [],
  imageHistory: [],
  videoHistory: [],
  imageFollowUpContext: null,
  stats: {
    orderCount: null,
    pendingOrderCount: null,
    videoTaskCount: null,
  },
  videoComposerAttachments: [],
  imageSessions: [],
  videoSessions: [],
  currentImageSessionId: "",
  currentVideoSessionId: "",
  imageRenamingSessionId: "",
  videoPendingAttachmentRole: "reference_image",
};

const page = document.body.dataset.page || "home";
const elements = {
  accountBalance: document.getElementById("account-balance"),
  accountUnit: document.getElementById("account-unit"),
  accountMeta: document.getElementById("account-meta"),
  metricOrders: document.getElementById("metric-orders"),
  metricPendingOrders: document.getElementById("metric-pending-orders"),
  metricVideoTasks: document.getElementById("metric-video-tasks"),
  accountSummary: document.getElementById("account-summary"),
  refreshAccount: document.getElementById("refresh-account"),
  recentOrders: document.getElementById("recent-orders"),
  recentVideoTasks: document.getElementById("recent-video-tasks"),
  imageForm: document.getElementById("image-form"),
  imageMessage: document.getElementById("image-message"),
  imageStatus: document.getElementById("image-status"),
  imageModelSelect: document.querySelector('select[name="model"]'),
  imageThread: document.getElementById("image-thread"),
  imageFollowUpPanel: document.getElementById("image-followup-panel"),
  imageComposerHint: document.getElementById("image-composer-hint"),
  imageSessionSelect: document.getElementById("image-session-select"),
  imageSessionList: document.getElementById("image-session-list"),
  imageSessionNew: document.getElementById("image-session-new"),
  imageSessionRename: document.getElementById("image-session-rename"),
  imageSessionDelete: document.getElementById("image-session-delete"),
  imageSessionMeta: document.getElementById("image-session-meta"),
  videoForm: document.getElementById("video-form"),
  videoMessage: document.getElementById("video-message"),
  videoStatus: document.getElementById("video-status"),
  videoThread: document.getElementById("video-thread"),
  videoSessionSelect: document.getElementById("video-session-select"),
  videoSessionList: document.getElementById("video-session-list"),
  videoSessionNew: document.getElementById("video-session-new"),
  videoSessionRename: document.getElementById("video-session-rename"),
  videoSessionDelete: document.getElementById("video-session-delete"),
  videoSessionMeta: document.getElementById("video-session-meta"),
  videoAttachmentTrigger: document.getElementById("video-attachment-trigger"),
  videoAttachmentInput: document.getElementById("video-attachment-input"),
  videoAttachmentPanel: document.getElementById("video-attachment-panel"),
  videoComposerHint: document.getElementById("video-composer-hint"),
  videoPromptField: document.querySelector('#video-form textarea[name="prompt"]'),
  videoMentionMenu: document.getElementById("video-mention-menu"),
  rechargeForm: document.getElementById("recharge-form"),
  rechargeMessage: document.getElementById("recharge-message"),
  paymentResult: document.getElementById("payment-result"),
  loginForm: document.getElementById("login-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginCode: document.getElementById("login-code"),
  loginSubjectType: document.getElementById("login-subject-type"),
  loginMessage: document.getElementById("login-message"),
  loginHint: document.getElementById("login-dev-hint"),
  loginModeBadge: document.getElementById("login-mode-badge"),
  loginModeHelp: document.getElementById("login-mode-help"),
  loginPasswordPanel: document.getElementById("login-password-panel"),
  loginSubjectPanel: document.getElementById("login-subject-panel"),
  loginRequestCode: document.getElementById("login-request-code"),
  loginSubmit: document.getElementById("login-submit"),
  loginCodeStep: document.getElementById("login-code-step"),
  profileSummary: document.getElementById("profile-summary"),
  profileHeading: document.getElementById("profile-heading"),
  adminSummary: document.getElementById("admin-summary"),
  adminUsersList: document.getElementById("admin-users-list"),
  adminMessage: document.getElementById("admin-message"),
  workspaceSidebarSlot: document.getElementById("workspace-sidebar-slot"),
  workspaceSidebarTitle: document.getElementById("workspace-sidebar-title"),
  workspaceSidebarSubtitle: document.getElementById("workspace-sidebar-subtitle"),
  workspaceSidebarLinks: document.getElementById("workspace-sidebar-links"),
  adminNavLinks: Array.from(document.querySelectorAll('[data-nav="admin"]')),
};

boot().catch((error) => {
  console.error(error);
});

async function boot() {
  markActiveNav();
  loadCache();
  renderImageThread();
  renderVideoThread();
  renderImageFollowUpPanel();
  renderVideoAttachmentPanel();
  bindEvents();

  const me = await hydrateAuthState();

  if (page === "login") {
    if (me.authenticated) {
      redirectAfterLogin();
      return;
    }
    initializeLoginPage();
    return;
  }

  if (isProtectedPage() && !me.authenticated) {
    redirectToLogin();
    return;
  }

  if (isAdminOnlyPage() && !isAdminSession()) {
    window.location.replace(getDefaultAuthenticatedPath());
    return;
  }

  renderWorkspaceShell();

  if (page === "image") {
    await Promise.all([loadRuntimeConfig(), initializeConversationManager("image")]);
    return;
  }

  if (page === "video") {
    await Promise.all([
      loadRuntimeConfig(),
      loadAccount(),
      loadOrders(),
      loadVideoTasks(),
      initializeConversationManager("video"),
    ]);
    return;
  }

  renderRecentOrders();
  renderRecentVideoTasks();
  renderStats();
  if (page === "profile") {
    await loadProfilePage();
    return;
  }

  if (page === "admin") {
    await loadAdminPage();
    return;
  }

  await Promise.all([loadRuntimeConfig(), loadAccount(), loadOrders(), loadVideoTasks()]);
}

function bindEvents() {
  document.addEventListener("click", handleDocumentClick);
  elements.refreshAccount?.addEventListener("click", refreshConsoleData);
  elements.imageSessionSelect?.addEventListener("change", (event) => {
    selectConversation("image", event.currentTarget.value);
  });
  elements.imageSessionList?.addEventListener("click", (event) => {
    if (event.target.closest("[data-session-title-input]")) {
      return;
    }
    const card = event.target.closest("[data-session-id]");
    if (!card) {
      return;
    }
    selectConversation("image", card.dataset.sessionId || "");
  });
  elements.imageSessionList?.addEventListener("change", (event) => {
    const input = event.target.closest("[data-session-title-input]");
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    updateConversationTitle("image", input.dataset.sessionId || "", input.value);
  });
  elements.imageSessionList?.addEventListener("keydown", (event) => {
    const input = event.target.closest("[data-session-title-input]");
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });
  elements.imageSessionNew?.addEventListener("click", () => createConversation("image"));
  elements.imageSessionRename?.addEventListener("click", () => renameConversation("image"));
  elements.imageSessionDelete?.addEventListener("click", () => deleteConversation("image"));
  elements.videoSessionSelect?.addEventListener("change", (event) => {
    selectConversation("video", event.currentTarget.value);
  });
  elements.videoSessionList?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-session-id]");
    if (!card) {
      return;
    }
    selectConversation("video", card.dataset.sessionId || "");
  });
  elements.videoSessionNew?.addEventListener("click", () => createConversation("video"));
  elements.videoSessionRename?.addEventListener("click", () => renameConversation("video"));
  elements.videoSessionDelete?.addEventListener("click", () => deleteConversation("video"));
  elements.videoForm?.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-video-upload-role]");
    if (!trigger) {
      return;
    }
    state.videoPendingAttachmentRole = trigger.dataset.videoUploadRole || "reference_image";
    elements.videoAttachmentInput?.click();
  });
  elements.videoPromptField?.addEventListener("input", renderVideoMentionMenu);
  elements.videoPromptField?.addEventListener("click", renderVideoMentionMenu);
  elements.videoPromptField?.addEventListener("keyup", renderVideoMentionMenu);
  elements.videoPromptField?.addEventListener("blur", () => {
    window.setTimeout(hideVideoMentionMenu, 120);
  });
  elements.videoMentionMenu?.addEventListener("mousedown", (event) => {
    const option = event.target.closest("[data-video-mention-index]");
    if (!option) {
      return;
    }
    event.preventDefault();
    insertVideoMention(Number(option.dataset.videoMentionIndex));
  });
  elements.videoAttachmentInput?.addEventListener("change", handleVideoAttachmentInputChange);

  elements.imageForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const prompt = String(formData.get("prompt") || "").trim();
    const payload = {
      model: formData.get("model"),
      sessionId: state.currentImageSessionId || createConversationId("image"),
      prompt: buildImageRequestPrompt(prompt),
      size: formData.get("size"),
      n: Number(formData.get("n") || 1),
      quality: formData.get("quality"),
    };

    const style = formData.get("style");
    if (style) {
      payload.style = style;
    }

    applyImageFollowUpPayload(payload);

    const userEntry = createThreadEntry("user", {
      prompt,
      meta: buildImageUserMeta(payload),
      contextPrompt: state.imageFollowUpContext?.prompt || "",
      contextPreview: state.imageFollowUpContext?.preview || "",
    });
    const assistantEntry = createThreadEntry("assistant", {
      kind: "image",
      status: "running",
      prompt,
      requestPrompt: payload.prompt,
      meta: buildImageAssistantMeta(payload),
      images: [],
      contextPrompt: state.imageFollowUpContext?.prompt || "",
    });

    pushThreadEntry("imageHistory", userEntry);
    pushThreadEntry("imageHistory", assistantEntry);
    touchCurrentConversation("image", prompt);

    setLoading(form, true);
    setMessage(elements.imageMessage, `预计扣费 ${formatAmount(getImageEstimateCents(payload))}，正在生成图像...`);
    if (elements.imageStatus) {
      elements.imageStatus.textContent = "生成中";
    }

    try {
      const data = await requestJson("/api/images/generations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      updateImageAssistantEntry(assistantEntry.id, data, payload, prompt);
      if (elements.imageStatus) {
        elements.imageStatus.textContent = "已完成";
      }
      setMessage(elements.imageMessage, "图像生成完成。");
      form.reset();
      hydrateImageModelSelect();
      clearImageFollowUpContext();
      renderConversationManager("image");
    } catch (error) {
      updateFailedImageEntry(assistantEntry.id, error.message);
      if (elements.imageStatus) {
        elements.imageStatus.textContent = "失败";
      }
      setMessage(elements.imageMessage, error.message, true);
    } finally {
      setLoading(form, false);
    }
  });

  elements.imageThread?.addEventListener("click", async (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.dataset.action;
    if (action === "use-image-context") {
      const entryId = actionTarget.dataset.entryId;
      const entry = state.imageHistory.find((item) => item.id === entryId);
      if (!entry) {
        return;
      }
      setImageFollowUpContext(entry);
      focusPromptField(elements.imageForm);
      return;
    }

    if (action === "download-image") {
      const src = actionTarget.dataset.src;
      const filename = actionTarget.dataset.filename || "image-result.png";
      if (src) {
        await downloadImage(src, filename);
      }
    }
  });

  elements.videoForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const prompt = String(formData.get("prompt") || "").trim();
    const attachments = state.videoComposerAttachments.map((item, index) => ({
      index,
      id: item.id,
      name: item.name,
      type: item.type,
      size: item.size,
      role: item.role,
      dataUrl: item.dataUrl,
    }));
    const videoRequest = buildVideoRequestPayload({
      prompt,
      duration: Number(formData.get("duration")),
      resolution: formData.get("resolution"),
      ratio: formData.get("aspectRatio"),
      attachments,
    });
    if (!videoRequest.isValid) {
      setMessage(elements.videoMessage, "请填写提示词，或至少添加一张图片附件。", true);
      return;
    }
    const payload = videoRequest.requestBody;
    payload.sessionId = state.currentVideoSessionId || createConversationId("video");

    const userEntry = createThreadEntry("user", {
      prompt,
      meta: buildVideoUserMeta(videoRequest),
      attachments: attachments.map(({ index, name, role, type, size }) => ({ index, name, role, type, size })),
    });
    const assistantEntry = createThreadEntry("assistant", {
      kind: "video",
      status: "queued",
      prompt,
      meta: buildVideoAssistantMeta(videoRequest),
      attachments: attachments.map(({ index, name, role, type, size }) => ({ index, name, role, type, size })),
      task: null,
    });

    pushThreadEntry("videoHistory", userEntry);
    pushThreadEntry("videoHistory", assistantEntry);
    touchCurrentConversation("video", prompt);

    setLoading(form, true);
    setMessage(elements.videoMessage, `预计扣费 ${formatAmount(getVideoEstimateCents(videoRequest))}，正在创建视频任务...`);
    if (elements.videoStatus) {
      elements.videoStatus.textContent = "提交中";
    }

    try {
      const data = await requestJson("/api/videos/generations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const task = normalizeTask(data?.data || data);
      pushRecentVideoTask(task);
      updateVideoAssistantEntry(assistantEntry.id, task, data);

      const taskId = task.taskId || task.id;
      if (!taskId) {
        throw new Error("接口未返回 taskId，无法轮询任务状态");
      }

      if (elements.videoStatus) {
        elements.videoStatus.textContent = task.status || task.state || "queued";
      }
      setMessage(elements.videoMessage, `任务已创建，ID: ${taskId}`);
      form.reset();
      clearVideoComposerAttachments();
      pollVideoTask(taskId, assistantEntry.id);
      renderConversationManager("video");
    } catch (error) {
      updateFailedVideoEntry(assistantEntry.id, error.message);
      if (elements.videoStatus) {
        elements.videoStatus.textContent = "失败";
      }
      setMessage(elements.videoMessage, error.message, true);
    } finally {
      setLoading(form, false);
    }
  });

  elements.videoThread?.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }
    if (actionTarget.dataset.action === "download-video") {
      const src = actionTarget.dataset.src;
      const filename = actionTarget.dataset.filename || "video-result.mp4";
      if (src) {
        downloadImage(src, filename);
      }
      return;
    }
    if (actionTarget.dataset.action !== "repoll-video") {
      return;
    }
    const taskId = actionTarget.dataset.taskId;
    const entryId = actionTarget.dataset.entryId;
    if (!taskId) {
      return;
    }
    pollVideoTask(taskId, entryId);
  });

  elements.videoAttachmentPanel?.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget || actionTarget.dataset.action !== "remove-video-attachment") {
      return;
    }
    removeVideoAttachment(actionTarget.dataset.attachmentId || "");
  });

  elements.videoAttachmentPanel?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || target.dataset.action !== "change-video-attachment-role") {
      return;
    }
    updateVideoAttachmentRole(target.dataset.attachmentId || "", target.value);
  });

  elements.rechargeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const channel = String(formData.get("channel") || "alipay");
    const payload = {
      amount: Math.round(Number(formData.get("amount")) * 100),
      channel,
      subject: formData.get("subject") || "账户余额充值",
    };

    setLoading(form, true);
    setMessage(elements.rechargeMessage, "正在创建充值订单...");

    try {
      const data = await requestJson("/api/recharge/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      renderPayment(data);
      pushRecentOrder(data?.data || data);
      setMessage(elements.rechargeMessage, "订单已创建，请按回执中的链接、二维码内容或跳转信息完成支付。");
      await refreshConsoleData();
    } catch (error) {
      setMessage(elements.rechargeMessage, error.message, true);
    } finally {
      setLoading(form, false);
    }
  });

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setLoginMode(button.dataset.authMode || "password");
    });
  });
  elements.loginRequestCode?.addEventListener("click", handleLoginCodeRequest);
  elements.loginForm?.addEventListener("submit", handleLoginSubmit);
}

async function refreshConsoleData() {
  if (!isUserSession()) {
    updateAccount(buildSessionScopedAccountPayload());
    state.recentOrders = [];
    state.recentVideoTasks = [];
    renderRecentOrders();
    renderRecentVideoTasks();
    renderStats();
    return;
  }
  await Promise.all([loadAccount(), loadOrders(), loadVideoTasks()]);
}

async function loadRuntimeConfig() {
  try {
    const data = await requestJson("/api/config", { method: "GET" });
    state.config.imageModels = Array.isArray(data.imageModels) && data.imageModels.length
      ? data.imageModels
      : state.config.imageModels;
    state.config.defaultImageModel = data.defaultImageModel || state.config.imageModels[0];
  } catch {
    // Keep defaults if config route is unavailable.
  }

  hydrateImageModelSelect();
}

async function initializeConversationManager(kind) {
  if (!isUserSession()) {
    const nextSession = makeConversation(kind);
    state[getConversationStateKey(kind)] = [nextSession];
    state[getCurrentConversationStateKey(kind)] = nextSession.id;
    renderConversationManager(kind);
    renderConversationThread(kind, []);
    saveCache();
    return;
  }

  const records = await fetchConversationRecords(kind);
  const sessions = buildConversationSessions(kind, records);
  const currentSessionId = getCurrentConversationId(kind);

  if (sessions.length) {
    state[getConversationStateKey(kind)] = sessions;
    state[getCurrentConversationStateKey(kind)] = sessions.some((item) => item.id === currentSessionId)
      ? currentSessionId
      : sessions[0].id;
  } else {
    const nextSession = makeConversation(kind);
    state[getConversationStateKey(kind)] = [nextSession];
    state[getCurrentConversationStateKey(kind)] = nextSession.id;
  }

  renderConversationManager(kind);
  await loadConversationThread(kind, state[getCurrentConversationStateKey(kind)]);
  saveCache();
}

async function fetchConversationRecords(kind, sessionId = "") {
  if (!isUserSession()) {
    return [];
  }

  const endpoint = kind === "image" ? "/api/images/history" : "/api/videos/history";
  const searchParams = new URLSearchParams({
    limit: String(MAX_SESSION_ITEMS),
  });
  if (sessionId) {
    searchParams.set("sessionId", sessionId);
  }

  try {
    const data = await requestJson(`${endpoint}?${searchParams.toString()}`, { method: "GET" });
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  }
}

function buildConversationSessions(kind, records) {
  const localSessions = state[getConversationStateKey(kind)] || [];
  const localMap = new Map(localSessions.map((item) => [item.id, item]));
  const grouped = new Map();

  records.forEach((record) => {
    const sessionId = typeof record?.sessionId === "string" ? record.sessionId.trim() : "";
    if (!sessionId) {
      return;
    }

    const current = grouped.get(sessionId) || {
      id: sessionId,
      createdAt: record.createdAt || record.updatedAt || new Date().toISOString(),
      updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
      prompt: record.prompt || "",
      itemCount: 0,
    };

    current.itemCount += 1;
    if ((record.updatedAt || "") > (current.updatedAt || "")) {
      current.updatedAt = record.updatedAt || current.updatedAt;
      current.prompt = record.prompt || current.prompt;
    }
    if ((record.createdAt || "") < (current.createdAt || "")) {
      current.createdAt = record.createdAt || current.createdAt;
    }

    grouped.set(sessionId, current);
  });

  const sessions = [...grouped.values()]
    .map((item, index) => {
      const local = localMap.get(item.id);
      return {
        id: item.id,
        title: local?.title || deriveConversationTitle(kind, item.prompt, index),
        createdAt: local?.createdAt || item.createdAt,
        updatedAt: item.updatedAt || local?.updatedAt || item.createdAt,
        itemCount: item.itemCount,
      };
    })
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));

  if (sessions.length) {
    return sessions;
  }

  return localSessions;
}

function deriveConversationTitle(kind, prompt, index = 0) {
  const fallback = kind === "image" ? `图像对话 ${index + 1}` : `视频对话 ${index + 1}`;
  const text = String(prompt || "").trim();
  return text ? truncateText(text, 18) : fallback;
}

function makeConversation(kind) {
  const sessions = state[getConversationStateKey(kind)] || [];
  const nextIndex = sessions.length + 1;
  return {
    id: createConversationId(kind),
    title: kind === "image" ? `图像对话 ${nextIndex}` : `视频对话 ${nextIndex}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    itemCount: 0,
  };
}

function createConversationId(kind) {
  return `${kind}_session_${createId()}`;
}

function getConversationStateKey(kind) {
  return kind === "image" ? "imageSessions" : "videoSessions";
}

function getCurrentConversationStateKey(kind) {
  return kind === "image" ? "currentImageSessionId" : "currentVideoSessionId";
}

function getCurrentConversationId(kind) {
  return state[getCurrentConversationStateKey(kind)] || "";
}

function getConversationElements(kind) {
  if (kind === "image") {
    return {
      select: elements.imageSessionSelect,
      meta: elements.imageSessionMeta,
      list: elements.imageSessionList,
    };
  }

  return {
    select: elements.videoSessionSelect,
    meta: elements.videoSessionMeta,
    list: elements.videoSessionList,
  };
}

function renderConversationManager(kind) {
  const { select, meta, list } = getConversationElements(kind);
  if (!select || !meta) {
    return;
  }

  const sessions = state[getConversationStateKey(kind)] || [];
  const currentSessionId = getCurrentConversationId(kind);
  select.innerHTML = sessions
    .map((item) => {
      const selected = item.id === currentSessionId ? " selected" : "";
      return `<option value="${escapeAttribute(item.id)}"${selected}>${escapeHtml(item.title)}</option>`;
    })
    .join("");

  const current = sessions.find((item) => item.id === currentSessionId);
  meta.textContent = current
    ? `${current.itemCount || 0} 条记录 · 最近更新 ${formatThreadTime(current.updatedAt)}`
    : "暂无对话";

  if (list) {
    if (!sessions.length) {
      list.innerHTML = "";
      return;
    }

    list.innerHTML = sessions
      .map((item) => {
        const isActive = item.id === currentSessionId;
        const isRenaming = kind === "image" && state.imageRenamingSessionId === item.id;
        const cardClass = isActive
          ? "w-full p-3 rounded-2xl bg-white shadow-[0_14px_26px_-18px_rgba(14,165,233,0.45)] border border-sky-100 flex flex-col items-start gap-2 cursor-pointer text-left"
          : "w-full p-3 rounded-2xl bg-white/75 hover:bg-white transition-colors flex flex-col items-start gap-2 cursor-pointer border border-transparent hover:border-sky-100 text-left";
        const titleClass = isActive
          ? `w-full bg-transparent border-none p-0 font-label-sm text-label-sm text-slate-800 font-medium truncate focus:ring-0 ${(kind === "image" && !isRenaming) || kind !== "image" ? "pointer-events-none" : ""}`
          : "w-full bg-transparent border-none p-0 font-label-sm text-label-sm text-slate-700 font-medium truncate focus:ring-0 pointer-events-none";
        const metaClass = isActive
          ? "w-full text-xs text-slate-500 truncate"
          : "w-full text-xs text-slate-400 truncate";
        const subtitle = kind === "image"
          ? `${item.itemCount || 0} 张图像 • ${formatThreadTime(item.updatedAt)}`
          : `${item.itemCount || 0} 条记录 • ${formatThreadTime(item.updatedAt)}`;

        return `
          <button class="${cardClass}" type="button" data-session-id="${escapeAttribute(item.id)}">
            <input
              class="${titleClass}"
              type="text"
              value="${escapeAttribute(item.title || "未命名对话")}"
              data-session-title-input
              data-session-id="${escapeAttribute(item.id)}"
              ${(kind === "image" && isRenaming) ? "" : "readonly"}
            />
            <p class="${metaClass}">${escapeHtml(subtitle)}</p>
          </button>
        `;
      })
      .join("");

    if (kind === "image" && state.imageRenamingSessionId) {
      const renameInput = list.querySelector(`[data-session-title-input][data-session-id="${CSS.escape(state.imageRenamingSessionId)}"]`);
      if (renameInput instanceof HTMLInputElement) {
        window.requestAnimationFrame(() => {
          renameInput.focus();
          renameInput.select();
        });
      }
    }
  }
}

async function createConversation(kind) {
  const nextSession = makeConversation(kind);
  state[getConversationStateKey(kind)] = [nextSession, ...(state[getConversationStateKey(kind)] || [])];
  state[getCurrentConversationStateKey(kind)] = nextSession.id;
  resetConversationUI(kind);
  renderConversationManager(kind);
  renderConversationThread(kind, []);
  saveCache();
}

async function selectConversation(kind, sessionId) {
  if (!sessionId || sessionId === getCurrentConversationId(kind)) {
    return;
  }

  if (kind === "image") {
    state.imageRenamingSessionId = "";
  }
  state[getCurrentConversationStateKey(kind)] = sessionId;
  resetConversationUI(kind);
  renderConversationManager(kind);
  await loadConversationThread(kind, sessionId);
  saveCache();
}

function renameConversation(kind) {
  const currentSessionId = getCurrentConversationId(kind);
  if (!currentSessionId) {
    return;
  }

  if (kind === "image") {
    state.imageRenamingSessionId = currentSessionId;
    renderConversationManager(kind);
    return;
  }

  const sessions = state[getConversationStateKey(kind)] || [];
  const current = sessions.find((item) => item.id === currentSessionId);
  if (!current) {
    return;
  }

  const nextTitle = window.prompt("输入新的对话名称", current.title || "");
  if (!nextTitle || !nextTitle.trim()) {
    return;
  }

  updateConversationTitle(kind, currentSessionId, nextTitle.trim());
}

function updateConversationTitle(kind, sessionId, nextTitle) {
  const normalizedTitle = String(nextTitle || "").trim();
  if (!sessionId || !normalizedTitle) {
    if (kind === "image") {
      state.imageRenamingSessionId = "";
    }
    renderConversationManager(kind);
    return;
  }

  state[getConversationStateKey(kind)] = (state[getConversationStateKey(kind)] || []).map((item) =>
    item.id === sessionId ? { ...item, title: normalizedTitle } : item,
  );
  if (kind === "image") {
    state.imageRenamingSessionId = "";
  }
  renderConversationManager(kind);
  saveCache();
}

async function deleteConversation(kind) {
  const currentSessionId = getCurrentConversationId(kind);
  if (!currentSessionId) {
    return;
  }

  const confirmed = window.confirm("删除当前对话后，该对话的历史记录也会被移除。是否继续？");
  if (!confirmed) {
    return;
  }

  const endpoint = kind === "image" ? "/api/images/history" : "/api/videos/history";
  try {
    await requestJson(`${endpoint}?sessionId=${encodeURIComponent(currentSessionId)}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (kind === "image") {
      setMessage(elements.imageMessage, error.message, true);
    } else {
      setMessage(elements.videoMessage, error.message, true);
    }
    return;
  }

  const nextSessions = (state[getConversationStateKey(kind)] || []).filter((item) => item.id !== currentSessionId);
  state[getConversationStateKey(kind)] = nextSessions.length ? nextSessions : [makeConversation(kind)];
  state[getCurrentConversationStateKey(kind)] = state[getConversationStateKey(kind)][0]?.id || "";

  if (kind === "video") {
    state.recentVideoTasks = state.recentVideoTasks.filter((item) => item.sessionId !== currentSessionId);
    renderRecentVideoTasks();
    renderStats();
  }

  resetConversationUI(kind);
  renderConversationManager(kind);
  await loadConversationThread(kind, getCurrentConversationId(kind));
  saveCache();
}

async function loadConversationThread(kind, sessionId) {
  const records = sessionId ? await fetchConversationRecords(kind, sessionId) : [];
  renderConversationThread(kind, records);
  updateConversationCount(kind, sessionId, records.length);
  renderConversationManager(kind);
}

function updateConversationCount(kind, sessionId, count) {
  state[getConversationStateKey(kind)] = (state[getConversationStateKey(kind)] || []).map((item) =>
    item.id === sessionId
      ? {
          ...item,
          itemCount: count,
          updatedAt: count ? item.updatedAt : item.createdAt,
        }
      : item,
  );
}

function touchCurrentConversation(kind, prompt = "") {
  const currentSessionId = getCurrentConversationId(kind);
  if (!currentSessionId) {
    return;
  }

  state[getConversationStateKey(kind)] = (state[getConversationStateKey(kind)] || []).map((item) =>
    item.id === currentSessionId
      ? {
          ...item,
          title: item.title || deriveConversationTitle(kind, prompt, 0),
          updatedAt: new Date().toISOString(),
          itemCount: (item.itemCount || 0) + 1,
        }
      : item,
  );
  renderConversationManager(kind);
  saveCache();
}

function renderConversationThread(kind, records) {
  if (kind === "image") {
    state.imageHistory = flattenConversationEntries(
      [...records]
        .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")))
        .flatMap(mapImageHistoryRecordToThreadEntries),
    );
    renderImageThread();
    return;
  }

  state.videoHistory = flattenConversationEntries(
    [...records]
      .map(normalizeTask)
      .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")))
      .flatMap(mapVideoTaskToThreadEntries),
  );
  renderVideoThread();
}

function flattenConversationEntries(entries) {
  return entries.slice(-MAX_THREAD_ITEMS);
}

function mapImageHistoryRecordToThreadEntries(record) {
  const images = Array.isArray(record?.images)
    ? record.images.map((item, index) => {
        const imageValue = item?.url || item?.b64Json || item?.b64_json || "";
        const src = imageValue.startsWith("data:") || imageValue.startsWith("http")
          ? imageValue
          : imageValue
            ? `data:${item?.mimeType || "image/png"};base64,${imageValue}`
            : "";
        return {
          id: `${record.id}-image-${index + 1}`,
          src,
          prompt: item?.revisedPrompt || record.prompt || `结果 ${index + 1}`,
          filename: `image-${record.id}-${index + 1}.png`,
        };
      })
    : [];

  return [
    createThreadEntry("user", {
      id: `${record.id}-user`,
      createdAt: record.createdAt,
      prompt: record.prompt || "",
      meta: buildImageUserMeta({
        model: record.model || record?.request?.model || "",
        size: record.size || record?.request?.size || "",
        n: images.length || record?.request?.n || 1,
        quality: record.quality || record?.request?.quality || "",
      }),
    }),
    createThreadEntry("assistant", {
      id: record.id,
      createdAt: record.updatedAt || record.createdAt,
      kind: "image",
      status: images.length ? "completed" : "empty",
      prompt: record.prompt || "",
      requestPrompt: record?.request?.prompt || record.prompt || "",
      meta: buildImageAssistantMeta({
        model: record.model || record?.request?.model || "",
        size: record.size || record?.request?.size || "",
        n: images.length || record?.request?.n || 1,
      }),
      backendHistoryId: record.id,
      backendSessionId: record.sessionId || "",
      images,
      downgradeNotice: record.referenceDowngradeReason || "",
      usedReferenceImage: Boolean(record.referenceApplied),
      summary: images.length ? `已生成 ${images.length} 张图片` : "该轮没有返回图像内容",
    }),
  ];
}

function mapVideoTaskToThreadEntries(task) {
  return [
    createThreadEntry("user", {
      id: `${task.id}-user`,
      createdAt: task.createdAt,
      prompt: task.prompt || "",
      meta: buildVideoUserMeta({
        duration: task?.remote?.duration || task?.request?.duration || "--",
        resolution: task?.remote?.resolution || task?.request?.resolution || "--",
        ratio: task?.remote?.ratio || task?.request?.ratio || "--",
        attachmentSummary: buildVideoAttachmentSummary(task.attachments || []),
      }),
      attachments: task.attachments || [],
    }),
    createThreadEntry("assistant", {
      id: task.id,
      createdAt: task.updatedAt || task.createdAt,
      kind: "video",
      status: task.status || "queued",
      prompt: task.prompt || "",
      meta: task.model ? `模型 ${task.model}` : "视频任务",
      attachments: task.attachments || [],
      taskId: task.taskId || task.id || "",
      task,
      summary: buildVideoSummary(task),
    }),
  ];
}

function resetConversationUI(kind) {
  if (kind === "image") {
    clearImageFollowUpContext();
    elements.imageForm?.reset();
    setMessage(elements.imageMessage, "");
    if (elements.imageStatus) {
      elements.imageStatus.textContent = "待开始";
    }
    hydrateImageModelSelect();
    return;
  }

  clearVideoComposerAttachments();
  stopVideoPolling();
  elements.videoForm?.reset();
  setMessage(elements.videoMessage, "");
  if (elements.videoStatus) {
    elements.videoStatus.textContent = "待提交";
  }
}

async function loadAccount() {
  if (!isUserSession()) {
    updateAccount(buildSessionScopedAccountPayload());
    return;
  }

  if (elements.accountMeta) {
    elements.accountMeta.textContent = "正在获取账户信息";
  }

  try {
    const data = await requestJson("/api/account", { method: "GET" });
    updateAccount(data);
  } catch (error) {
    if (elements.accountBalance) {
      elements.accountBalance.textContent = "--";
    }
    if (elements.accountUnit) {
      elements.accountUnit.textContent = "CNY";
    }
    if (elements.accountMeta) {
      elements.accountMeta.textContent = error.message;
    }
  }
}

async function loadOrders() {
  if (!isUserSession()) {
    state.recentOrders = [];
    renderRecentOrders();
    renderStats();
    return;
  }

  try {
    const data = await requestJson(`/api/recharge/orders?limit=${MAX_RECENT_ITEMS}`, {
      method: "GET",
    });
    const items = Array.isArray(data?.items) ? data.items.map(normalizeOrder) : [];
    state.recentOrders = items.slice(0, MAX_RECENT_ITEMS);
    renderRecentOrders();
    renderStats();
    saveCache();
  } catch {
    renderRecentOrders();
  }
}

async function loadVideoTasks() {
  if (!isUserSession()) {
    state.recentVideoTasks = [];
    renderRecentVideoTasks();
    renderStats();
    return;
  }

  try {
    const data = await requestJson(`/api/videos/tasks?limit=${MAX_RECENT_ITEMS}`, {
      method: "GET",
    });
    const items = Array.isArray(data?.items) ? data.items.map(normalizeTask) : [];
    state.recentVideoTasks = items.slice(0, MAX_RECENT_ITEMS);
    if (items.length || page === "video" || elements.recentVideoTasks) {
      renderRecentVideoTasks();
      renderStats();
      saveCache();
    }
  } catch {
    renderRecentVideoTasks();
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    if (response.status === 401 && page !== "login" && isProtectedPage()) {
      redirectToLogin();
      throw new Error("登录已过期，正在跳转到登录页。");
    }
    const message =
      data?.error?.message ||
      data.message ||
      data.error ||
      `请求失败：${response.status} ${response.statusText}`;
    const details = data?.error?.details;
    if (details?.code === "insufficient_balance") {
      throw new Error(`余额不足，请前往 /recharge 充值。当前余额 ${formatAmount(details.balance, details.currency)}，需要 ${formatAmount(details.requiredAmount, details.currency)}。`);
    }
    if (details?.code === "balance_conflict") {
      throw new Error(`扣费失败：账户余额在处理过程中发生变化，请前往 /recharge 充值后重试。当前余额 ${formatAmount(details.balance, details.currency)}。`);
    }
    if (details && typeof details === "object") {
      const detailParts = [];
      if (details.status) {
        detailParts.push(`upstream ${details.status}`);
      }
      if (typeof details.body === "string") {
        detailParts.push(details.body);
      } else if (details.body && typeof details.body === "object") {
        const bodyMessage =
          details.body.error?.message ||
          details.body.message ||
          JSON.stringify(details.body);
        if (bodyMessage) {
          detailParts.push(bodyMessage);
        }
      }
      if (detailParts.length) {
        throw new Error(`${message} (${detailParts.join(" / ")})`);
      }
    }
    throw new Error(message);
  }

  return data;
}

function hydrateImageModelSelect() {
  if (!elements.imageModelSelect) {
    return;
  }

  const options = state.config.imageModels.length
    ? state.config.imageModels
    : [state.config.defaultImageModel || "gpt-image-2"];
  const selected = elements.imageModelSelect.value || state.config.defaultImageModel || options[0];

  elements.imageModelSelect.innerHTML = options
    .map((model) => {
      const isSelected = model === selected;
      return `<option value="${escapeAttribute(model)}"${isSelected ? " selected" : ""}>${escapeHtml(model)}</option>`;
    })
    .join("");
}

function loadCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return;
    }
    const cached = JSON.parse(raw);
    state.recentOrders = Array.isArray(cached.recentOrders) ? cached.recentOrders.slice(0, MAX_RECENT_ITEMS) : [];
    state.recentVideoTasks = Array.isArray(cached.recentVideoTasks)
      ? cached.recentVideoTasks.slice(0, MAX_RECENT_ITEMS)
      : [];
    state.imageHistory = Array.isArray(cached.imageHistory) ? cached.imageHistory.slice(0, MAX_THREAD_ITEMS) : [];
    state.videoHistory = Array.isArray(cached.videoHistory) ? cached.videoHistory.slice(0, MAX_THREAD_ITEMS) : [];
    state.imageSessions = Array.isArray(cached.imageSessions) ? cached.imageSessions : [];
    state.videoSessions = Array.isArray(cached.videoSessions) ? cached.videoSessions : [];
    state.currentImageSessionId = typeof cached.currentImageSessionId === "string" ? cached.currentImageSessionId : "";
    state.currentVideoSessionId = typeof cached.currentVideoSessionId === "string" ? cached.currentVideoSessionId : "";
  } catch {
    state.recentOrders = [];
    state.recentVideoTasks = [];
    state.imageHistory = [];
    state.videoHistory = [];
    state.imageSessions = [];
    state.videoSessions = [];
    state.currentImageSessionId = "";
    state.currentVideoSessionId = "";
  }
}

function saveCache() {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        recentOrders: state.recentOrders.slice(0, MAX_RECENT_ITEMS),
        recentVideoTasks: state.recentVideoTasks.slice(0, MAX_RECENT_ITEMS),
        imageHistory: state.imageHistory.slice(0, MAX_THREAD_ITEMS),
        videoHistory: state.videoHistory.slice(0, MAX_THREAD_ITEMS),
        imageSessions: state.imageSessions,
        videoSessions: state.videoSessions,
        currentImageSessionId: state.currentImageSessionId,
        currentVideoSessionId: state.currentVideoSessionId,
      }),
    );
  } catch {
    // Ignore storage failures.
  }
}

function markActiveNav() {
  for (const link of document.querySelectorAll(".nav-link")) {
    if (link.dataset.nav === page) {
      link.classList.add("is-active");
    }
  }
}

function isProtectedPage() {
  return PROTECTED_PAGES.has(page);
}

function isAdminOnlyPage() {
  return ADMIN_ONLY_PAGES.has(page);
}

function isUserSession() {
  return state.auth.authenticated && state.auth.subjectType === "user";
}

function isAdminSession() {
  return state.auth.authenticated && state.auth.subjectType === "admin";
}

async function hydrateAuthState() {
  try {
    const payload = await requestJson("/api/me", { method: "GET" });
    applyAuthState(payload);
    return state.auth;
  } catch {
    applyAuthState({ authenticated: false, session: null, user: null, admin: null });
    return state.auth;
  }
}

function applyAuthState(payload) {
  const root = payload?.data || payload || {};
  const subjectType = root.session?.subjectType || "";
  const profile = subjectType === "admin" ? root.admin : root.user;
  state.auth = {
    authenticated: Boolean(root.authenticated),
    session: root.session || null,
    user: root.user || null,
    admin: root.admin || null,
    subjectType,
    email: profile?.email || "",
    role: subjectType === "admin" ? profile?.role || "admin" : "user",
  };
}

function handleDocumentClick(event) {
  const logoutTrigger = event.target.closest("[data-action='logout']");
  if (logoutTrigger) {
    event.preventDefault();
    handleLogout();
  }
}

async function handleLogout() {
  try {
    await requestJson("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch {
    // Ignore logout failures and continue to local reset.
  }

  applyAuthState({ authenticated: false, session: null, user: null, admin: null });
  state.recentOrders = [];
  state.recentVideoTasks = [];
  state.imageHistory = [];
  state.videoHistory = [];
  state.imageSessions = [];
  state.videoSessions = [];
  state.currentImageSessionId = "";
  state.currentVideoSessionId = "";
  saveCache();
  redirectToLogin();
}

function renderWorkspaceShell() {
  const existing = document.getElementById("workspace-auth-shell");
  existing?.remove();
  const existingMobile = document.getElementById("workspace-auth-shell-mobile");
  existingMobile?.remove();

  if (!state.auth.authenticated || page === "login") {
    syncAdminEntryVisibility();
    renderWorkspaceSidebarGuest();
    return;
  }

  const profileHref = "/profile";
  const adminHref = "/admin";
  const subjectLabel = isAdminSession() ? "管理员" : "个人中心";
  const roleLabel = isAdminSession() ? (state.auth.role || "admin") : "workspace";
  const summary = isUserSession() ? "已连接个人工作台" : "已连接后台工作台";

  renderWorkspaceSidebarAuthenticated({
    title: state.auth.email || "已登录",
    subtitle: `${summary} · ${roleLabel}`,
    profileHref,
    adminHref,
  });
  syncAdminEntryVisibility();

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <nav class="fixed inset-x-3 bottom-3 z-[60] rounded-[28px] border border-white/70 bg-white/90 p-3 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl md:hidden" id="workspace-auth-shell-mobile">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-slate-900">${escapeHtml(state.auth.email || "已登录")}</p>
            <p class="truncate text-xs text-slate-500">${escapeHtml(summary)}</p>
          </div>
          <button class="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-600" data-action="logout" type="button">退出</button>
        </div>
        <div class="mt-3 flex gap-2">
          <a class="nav-link flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm text-slate-700" data-nav="profile" href="${profileHref}">个人中心</a>
          ${isAdminSession() ? `<a class="nav-link flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm text-slate-700" data-nav="admin" href="${adminHref}">后台入口</a>` : ""}
        </div>
      </nav>
    `,
  );

  markActiveNav();
}

function renderWorkspaceSidebarGuest() {
  if (!elements.workspaceSidebarSlot) {
    return;
  }
  if (elements.workspaceSidebarTitle) {
    elements.workspaceSidebarTitle.textContent = "未登录";
  }
  if (elements.workspaceSidebarSubtitle) {
    elements.workspaceSidebarSubtitle.textContent = "登录后可查看工作台";
  }
  if (elements.workspaceSidebarLinks) {
    elements.workspaceSidebarLinks.innerHTML = `
      <a class="rounded-full border border-sky-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-sky-50" href="/login">登录</a>
      <a class="rounded-full border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100" href="/login">注册</a>
    `;
  }
}

function syncAdminEntryVisibility() {
  const visible = isAdminSession();
  elements.adminNavLinks?.forEach((link) => {
    link.classList.toggle("hidden", !visible);
  });
}

function renderWorkspaceSidebarAuthenticated({ title, subtitle, profileHref, adminHref }) {
  if (!elements.workspaceSidebarSlot) {
    return;
  }
  if (elements.workspaceSidebarTitle) {
    elements.workspaceSidebarTitle.textContent = title;
  }
  if (elements.workspaceSidebarSubtitle) {
    elements.workspaceSidebarSubtitle.textContent = subtitle;
  }
  if (elements.workspaceSidebarLinks) {
    elements.workspaceSidebarLinks.innerHTML = `
      <a class="rounded-full border border-sky-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-sky-50" data-nav="profile" href="${profileHref}">个人中心</a>
      ${isAdminSession() ? `<a class="rounded-full border border-sky-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-sky-50" data-nav="admin" href="${adminHref}">后台入口</a>` : ""}
      <button class="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100" data-action="logout" type="button">退出</button>
    `;
  }
}

function initializeLoginPage() {
  state.registerCodeSent = false;
  setLoginMode(state.loginMode || "password");
  const redirectTo = getRedirectTargetFromLocation();
  if (elements.loginMessage && redirectTo) {
    elements.loginMessage.textContent = `登录成功后将返回 ${redirectTo}`;
  }
}

function setLoginMode(mode) {
  const nextMode = mode === "register" ? "register" : "password";
  state.loginMode = nextMode;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    const isActive = button.dataset.authMode === nextMode;
    button.classList.toggle("bg-white", isActive);
    button.classList.toggle("text-slate-950", isActive);
    button.classList.toggle("shadow-sm", isActive);
    button.classList.toggle("text-slate-600", !isActive);
  });

  if (elements.loginHint) {
    elements.loginHint.textContent = "";
  }

  const isRegisterMode = nextMode === "register";
  const showSubjectPanel = !isRegisterMode;

  elements.loginPasswordPanel?.classList.remove("hidden");
  elements.loginSubjectPanel?.classList.toggle("hidden", !showSubjectPanel);
  elements.loginCodeStep?.classList.toggle("hidden", !isRegisterMode);
  elements.loginRequestCode?.classList.toggle("hidden", !isRegisterMode);
  elements.loginRequestCode?.classList.toggle("inline-flex", isRegisterMode);

  if (elements.loginSubjectType) {
    if (isRegisterMode) {
      elements.loginSubjectType.value = "user";
    } else {
      elements.loginSubjectType.value = elements.loginSubjectType.value || "user";
    }
  }

  if (elements.loginModeBadge) {
    elements.loginModeBadge.textContent = nextMode === "register" ? "注册账号" : "密码登录";
  }

  if (elements.loginSubmit) {
    elements.loginSubmit.textContent = nextMode === "register" ? "完成注册" : "登录";
  }

  if (elements.loginModeHelp) {
    elements.loginModeHelp.textContent =
      nextMode === "register"
        ? "填写邮箱和密码，先发送注册验证码，再输入验证码完成账号激活。"
        : "选择普通用户或管理员身份后，使用邮箱和密码直接登录。";
  }

  if (elements.loginMessage) {
    elements.loginMessage.textContent =
      nextMode === "register"
        ? "请输入邮箱、密码和验证码；先点击发送验证码。"
        : "请输入邮箱、身份和密码。";
  }
}

async function handleLoginCodeRequest() {
  await handleRegisterCodeRequest();
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (state.loginMode === "register") {
    await handleRegisterSubmit(event);
    return;
  }
  await handlePasswordLoginSubmit(event);
}

async function handlePasswordLoginSubmit(event) {
  const email = String(elements.loginEmail?.value || "").trim();
  const password = String(elements.loginPassword?.value || "");
  const subjectType = String(elements.loginSubjectType?.value || "user").trim();

  if (!email || !password) {
    setMessage(elements.loginMessage, "请输入邮箱和密码。", true);
    return;
  }

  setLoading(event.currentTarget, true);
  setMessage(elements.loginMessage, "正在登录...");

  try {
    const data = await requestJson("/api/auth/password/login", {
      method: "POST",
      body: JSON.stringify({ email, password, subjectType }),
    });
    applyAuthState(data);
    redirectAfterLogin();
  } catch (error) {
    setMessage(elements.loginMessage, error.message, true);
  } finally {
    setLoading(event.currentTarget, false);
  }
}

async function handleRegisterSubmit(event) {
  const email = String(elements.loginEmail?.value || "").trim();
  const code = String(elements.loginCode?.value || "").trim();

  if (!email || !code) {
    setMessage(elements.loginMessage, "请输入邮箱和验证码。", true);
    return;
  }

  if (!state.registerCodeSent) {
    setMessage(elements.loginMessage, "请先发送注册验证码。", true);
    return;
  }

  setLoading(event.currentTarget, true);
  setMessage(elements.loginMessage, "正在完成注册...");

  try {
    await requestJson("/api/auth/register/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
    state.registerCodeSent = false;
    setLoginMode("password");
    if (elements.loginEmail) {
      elements.loginEmail.value = email;
    }
    if (elements.loginSubjectType) {
      elements.loginSubjectType.value = "user";
    }
    if (elements.loginPassword) {
      elements.loginPassword.value = "";
    }
    if (elements.loginCode) {
      elements.loginCode.value = "";
    }
    setMessage(elements.loginMessage, "注册完成，请使用密码登录。");
    if (elements.loginHint) {
      elements.loginHint.textContent = "";
    }
  } catch (error) {
    setMessage(elements.loginMessage, error.message, true);
  } finally {
    setLoading(event.currentTarget, false);
  }
}

async function handleRegisterCodeRequest() {
  const email = String(elements.loginEmail?.value || "").trim();
  const password = String(elements.loginPassword?.value || "");

  if (!email || !password) {
    setMessage(elements.loginMessage, "请输入邮箱和密码。", true);
    return;
  }

  elements.loginRequestCode && (elements.loginRequestCode.disabled = true);
  setMessage(elements.loginMessage, "正在发送注册验证码...");

  try {
    const data = await requestJson("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    state.registerCodeSent = true;
    elements.loginCodeStep?.classList.remove("hidden");
    setMessage(elements.loginMessage, "验证码已发送，请输入验证码完成注册。");
    if (elements.loginHint && data?.delivery?.devCode) {
      elements.loginHint.textContent = `开发验证码：${data.delivery.devCode}`;
    }
    elements.loginCode?.focus();
  } catch (error) {
    setMessage(elements.loginMessage, error.message, true);
  } finally {
    elements.loginRequestCode && (elements.loginRequestCode.disabled = false);
  }
}

function redirectToLogin() {
  const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(`/login?redirectTo=${encodeURIComponent(target)}`);
}

function redirectAfterLogin() {
  const redirectTo = getRedirectTargetFromLocation();
  window.location.replace(redirectTo || getDefaultAuthenticatedPath());
}

function getRedirectTargetFromLocation() {
  const redirectTo = new URLSearchParams(window.location.search).get("redirectTo") || "";
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("/login")) {
    return "";
  }
  return redirectTo;
}

function getDefaultAuthenticatedPath() {
  return isAdminSession() ? "/admin" : "/";
}

function buildSessionScopedAccountPayload() {
  const profile = state.auth.subjectType === "admin" ? state.auth.admin : state.auth.user;
  return {
    account: {
      email: profile?.email || state.auth.email || "已登录用户",
      nickname: state.auth.subjectType === "admin" ? "管理员工作台" : "个人工作台",
      balance: 0,
      currency: state.auth.subjectType === "admin" ? "ADMIN" : "CNY",
    },
    stats: {
      orderCount: 0,
      pendingOrderCount: 0,
      videoTaskCount: 0,
    },
  };
}

async function loadProfilePage() {
  updateAccount(isUserSession() ? await requestJson("/api/account", { method: "GET" }) : buildSessionScopedAccountPayload());
  if (elements.profileHeading) {
    elements.profileHeading.textContent = state.auth.email || "个人中心";
  }
  if (elements.profileSummary) {
    const roleLabel = isAdminSession() ? `管理员 / ${state.auth.role || "admin"}` : "普通用户";
    const session = state.auth.session || {};
    elements.profileSummary.innerHTML = `
      <div class="workspace-stat-card"><span>登录身份</span><strong>${escapeHtml(roleLabel)}</strong></div>
      <div class="workspace-stat-card"><span>邮箱</span><strong>${escapeHtml(state.auth.email || "--")}</strong></div>
      <div class="workspace-stat-card"><span>会话创建</span><strong>${escapeHtml(formatThreadTime(session.createdAt || ""))}</strong></div>
      <div class="workspace-stat-card"><span>会话到期</span><strong>${escapeHtml(formatThreadTime(session.expiresAt || ""))}</strong></div>
    `;
  }
}

async function loadAdminPage() {
  if (!elements.adminSummary || !elements.adminUsersList) {
    return;
  }

  elements.adminSummary.innerHTML = `
    <div class="workspace-stat-card"><span>管理员邮箱</span><strong>${escapeHtml(state.auth.email || "--")}</strong></div>
    <div class="workspace-stat-card"><span>角色</span><strong>${escapeHtml(state.auth.role || "admin")}</strong></div>
    <div class="workspace-stat-card"><span>会话类型</span><strong>${escapeHtml(state.auth.subjectType || "--")}</strong></div>
  `;

  try {
    const data = await requestJson("/api/admin/users?limit=20", { method: "GET" });
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      elements.adminUsersList.className = "list-panel empty-state";
      elements.adminUsersList.textContent = "暂无用户记录";
      return;
    }
    elements.adminUsersList.className = "list-panel";
    elements.adminUsersList.innerHTML = items
      .map(
        (item) => `
          <article class="list-item">
            <div class="list-item-head">
              <strong>${escapeHtml(item.email || item.id || "--")}</strong>
              ${renderStatusBadge(item.status || "--")}
            </div>
            <div class="list-item-body">
              <div class="list-item-meta">
                <span>${escapeHtml(item.id || "--")}</span>
                <span>${escapeHtml(item.balance == null ? "--" : formatCurrencyValue(item.balance))} ${escapeHtml(item.currency || "CNY")}</span>
              </div>
              <p>${escapeHtml(item.updatedAt || item.createdAt || "--")}</p>
            </div>
          </article>
        `,
      )
      .join("");
    if (elements.adminMessage) {
      elements.adminMessage.textContent = `已加载 ${items.length} 个用户。`;
    }
  } catch (error) {
    elements.adminUsersList.className = "list-panel empty-state";
    elements.adminUsersList.textContent = "加载用户列表失败";
    setMessage(elements.adminMessage, error.message, true);
  }
}

function setLoading(form, isLoading) {
  form.classList.toggle("is-loading", isLoading);
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = isLoading;
  }
}

function setMessage(element, message, isError = false) {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function normalizeArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.images)) {
    return payload.images;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  return [];
}

function extractImageUrl(item) {
  if (!item || typeof item !== "object") {
    return "";
  }
  const imageUrl = item.image_url;
  return item.url || item.b64_json || item.b64 || imageUrl?.url || imageUrl || "";
}

function buildImageRequestPrompt(prompt) {
  if (!state.imageFollowUpContext?.prompt) {
    return prompt;
  }

  return [
    "请基于上一张已生成图片的设定继续修改，尽量保持主体、镜头和整体风格一致。",
    `上一轮图像设定：${state.imageFollowUpContext.prompt}`,
    `本轮修改要求：${prompt}`,
  ].join("\n");
}

function applyImageFollowUpPayload(payload) {
  if (!state.imageFollowUpContext?.preview) {
    return;
  }

  const preview = state.imageFollowUpContext.preview;
  payload.parentId = state.imageFollowUpContext.entryId;

  // Avoid sending a huge data URL in the request body. The backend can
  // recover the reference image from history via parentId when needed.
  if (preview.startsWith("http://") || preview.startsWith("https://")) {
    payload.referenceImage = preview;
    payload.referenceImageUrl = preview;
    payload.input_image = preview;
    payload.image = preview;
  }
}

function buildImageUserMeta(payload) {
  const parts = [payload.model, payload.size, `x${payload.n}`, payload.quality, `预计 ${formatAmount(getImageEstimateCents(payload))}`];
  if (payload.style) {
    parts.push(payload.style);
  }
  return parts.filter(Boolean).join(" / ");
}

function buildImageAssistantMeta(payload) {
  return `模型 ${payload.model} / 尺寸 ${payload.size} / 数量 ${payload.n} / 预计 ${formatAmount(getImageEstimateCents(payload))}`;
}

function buildVideoUserMeta(payload) {
  const parts = [`${payload.duration}s`, payload.resolution, payload.ratio, `预计 ${formatAmount(getVideoEstimateCents(payload))}`];
  if (payload.attachmentSummary) {
    parts.push(payload.attachmentSummary);
  }
  return parts.filter(Boolean).join(" / ");
}

function buildVideoAssistantMeta(payload) {
  const parts = [`任务规格 ${payload.duration}s`, payload.resolution, payload.ratio, `预计 ${formatAmount(getVideoEstimateCents(payload))}`];
  if (payload.attachmentSummary) {
    parts.push(payload.attachmentSummary);
  }
  return parts.filter(Boolean).join(" / ");
}

function getImageEstimateCents(payload) {
  const count = Number.parseInt(String(payload?.n || 1), 10);
  return (Number.isFinite(count) && count > 0 ? count : 1) * IMAGE_PRICE_PER_OUTPUT_CENTS;
}

function getVideoEstimateCents(payload) {
  const duration = Number.parseInt(String(payload?.duration || 5), 10);
  return (Number.isFinite(duration) && duration > 0 ? duration : 5) * VIDEO_PRICE_PER_SECOND_CENTS;
}

function buildVideoRequestPayload({ prompt, duration, resolution, ratio, attachments }) {
  const normalizedAttachments = Array.isArray(attachments) ? attachments.filter((item) => item?.dataUrl) : [];
  const attachmentSummary = buildVideoAttachmentSummary(normalizedAttachments);
  const normalizedPrompt = normalizeVideoPromptReferences(prompt, normalizedAttachments);

  if (!normalizedAttachments.length) {
    return {
      isValid: Boolean(normalizedPrompt),
      duration,
      resolution,
      ratio,
      attachmentSummary,
      requestBody: {
        prompt: normalizedPrompt,
        duration,
        resolution,
        ratio,
      },
    };
  }

  const content = [];
  if (normalizedPrompt) {
    content.push({
      type: "text",
      text: normalizedPrompt,
    });
  }

  return {
    isValid: Boolean(normalizedPrompt) || normalizedAttachments.length > 0,
    duration,
    resolution,
    ratio,
    attachmentSummary,
    requestBody: {
      duration,
      resolution,
      ratio,
      content: [
        ...content,
        ...normalizedAttachments.map((item) => ({
          type: "image_url",
          image_url: {
            url: item.dataUrl,
          },
          role: item.role || "reference_image",
        })),
      ],
    },
  };
}

function normalizeVideoPromptReferences(prompt, attachments) {
  let nextPrompt = String(prompt || "").trim();
  if (!nextPrompt) {
    return "";
  }

  attachments.forEach((item, index) => {
    const mention = buildVideoAttachmentMention(index);
    const reference = `[图${index + 1}]`;
    nextPrompt = nextPrompt.split(mention).join(reference);
  });

  return nextPrompt;
}

function buildVideoAttachmentMention(index) {
  return `@图片${index + 1}`;
}

function buildVideoAttachmentSummary(attachments) {
  if (!attachments.length) {
    return "";
  }

  const roleMap = {
    reference_image: "参考图",
    first_frame: "首帧",
    last_frame: "尾帧",
  };
  const counts = attachments.reduce((acc, item) => {
    const key = item.role || "reference_image";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const detail = Object.entries(counts)
    .map(([role, count]) => `${roleMap[role] || role}x${count}`)
    .join(" ");

  return `已附 ${attachments.length} 张${detail ? ` (${detail})` : ""}`;
}

function createThreadEntry(role, data) {
  return {
    id: createId(),
    role,
    createdAt: new Date().toISOString(),
    ...data,
  };
}

function pushThreadEntry(stateKey, entry) {
  state[stateKey] = [...state[stateKey], entry].slice(-MAX_THREAD_ITEMS);
  renderThreadByKey(stateKey);
  saveCache();
}

function updateThreadEntry(stateKey, entryId, updater) {
  state[stateKey] = state[stateKey].map((entry) => {
    if (entry.id !== entryId) {
      return entry;
    }
    return typeof updater === "function" ? updater(entry) : { ...entry, ...updater };
  });
  renderThreadByKey(stateKey);
  saveCache();
}

function renderThreadByKey(stateKey) {
  if (stateKey === "imageHistory") {
    renderImageThread();
    return;
  }
  if (stateKey === "videoHistory") {
    renderVideoThread();
  }
}

function updateImageAssistantEntry(entryId, payload, requestPayload, prompt) {
  const images = normalizeArray(payload).map((item, index) => {
    const imageValue = extractImageUrl(item);
    const src = imageValue.startsWith("data:") || imageValue.startsWith("http")
      ? imageValue
      : `data:image/png;base64,${imageValue}`;
    return {
      id: `${entryId}-${index + 1}`,
      src,
      prompt: item.revised_prompt || item.prompt || prompt || `结果 ${index + 1}`,
      filename: `image-${formatCompactTime(new Date().toISOString())}-${index + 1}.png`,
    };
  });

  const historyEntry = payload?.history || {};
  const backendHistoryId =
    historyEntry.id ||
    payload?.historyId ||
    payload?.history_id ||
    "";
  const backendSessionId =
    historyEntry.sessionId ||
    payload?.sessionId ||
    payload?.session_id ||
    "";
  const referenceApplied = Boolean(
    payload?.referenceImageApplied ??
      payload?.reference_applied ??
      payload?.data?.referenceImageApplied ??
      payload?.data?.reference_applied,
  );

  updateThreadEntry("imageHistory", entryId, (entry) => ({
    ...entry,
    status: images.length ? "completed" : "empty",
    prompt,
    requestPrompt: requestPayload.prompt,
    meta: buildImageAssistantMeta(requestPayload),
    rawPayload: payload,
    backendHistoryId,
    backendSessionId,
    images,
    downgradeNotice: extractImageDowngradeNotice(payload),
    usedReferenceImage: referenceApplied,
    summary: images.length
      ? `已生成 ${images.length} 张图片，已扣费 ${formatAmount(payload?.chargedAmount ?? getImageEstimateCents(requestPayload), payload?.currency || "CNY")}`
      : "接口返回成功，但没有图像内容",
  }));
}

function updateFailedImageEntry(entryId, message) {
  updateThreadEntry("imageHistory", entryId, {
    status: "failed",
    summary: message,
    images: [],
  });
}

function updateVideoAssistantEntry(entryId, task, payload) {
  updateThreadEntry("videoHistory", entryId, (entry) => ({
    ...entry,
    status: task.status || "queued",
    taskId: task.taskId || task.id || entry.taskId || "",
    task,
    rawPayload: payload,
    summary: buildVideoSummary(task),
  }));
}

function updateFailedVideoEntry(entryId, message) {
  updateThreadEntry("videoHistory", entryId, {
    status: "failed",
    summary: message,
  });
}

function setImageFollowUpContext(entry) {
  const sourcePrompt =
    entry.prompt ||
    entry.requestPrompt ||
    entry.images?.[0]?.prompt ||
    "";
  const preview = entry.images?.[0]?.src || "";

  if (!sourcePrompt) {
    return;
  }

  state.imageFollowUpContext = {
    entryId: entry.backendHistoryId || entry.id,
    localEntryId: entry.id,
    prompt: sourcePrompt,
    preview,
    filename: entry.images?.[0]?.filename || "",
  };
  renderImageFollowUpPanel();
}

function clearImageFollowUpContext() {
  state.imageFollowUpContext = null;
  renderImageFollowUpPanel();
}

function renderImageFollowUpPanel() {
  if (!elements.imageFollowUpPanel) {
    return;
  }

  if (!state.imageFollowUpContext) {
    elements.imageFollowUpPanel.className = "composer-context is-hidden";
    elements.imageFollowUpPanel.innerHTML = "";
    if (elements.imageComposerHint) {
      elements.imageComposerHint.textContent = "首次发送会生成新图，点任意历史结果可继续修改。";
    }
    return;
  }

  const previewMarkup = state.imageFollowUpContext.preview
    ? `<img src="${escapeAttribute(state.imageFollowUpContext.preview)}" alt="上下文预览" />`
    : "";

  elements.imageFollowUpPanel.className = "composer-context";
  elements.imageFollowUpPanel.innerHTML = `
    <div class="composer-context-card">
      <div class="composer-context-preview">${previewMarkup}</div>
      <div class="composer-context-copy">
        <span>当前基于上一轮结果继续修改</span>
        <strong>${escapeHtml(truncateText(state.imageFollowUpContext.prompt, 120))}</strong>
      </div>
      <button class="mini-button" type="button" data-action="clear-followup">清除上下文</button>
    </div>
  `;

  elements.imageFollowUpPanel
    .querySelector('[data-action="clear-followup"]')
    ?.addEventListener("click", clearImageFollowUpContext);

  if (elements.imageComposerHint) {
    elements.imageComposerHint.textContent = "本次提交会带上上一张图继续修改。";
  }
}

function renderImageThread() {
  if (!elements.imageThread) {
    return;
  }
  if (!state.imageHistory.length) {
    elements.imageThread.className = "thread-stream image-thread-empty";
    elements.imageThread.innerHTML = "";
    return;
  }

  elements.imageThread.className = "thread-stream";
  elements.imageThread.innerHTML = state.imageHistory
    .map((entry) => {
      if (entry.role === "user") {
        return renderUserThreadCard(entry);
      }
      return renderImageAssistantCard(entry);
    })
    .join("");
}

function renderVideoThread() {
  if (!elements.videoThread) {
    return;
  }
  if (!state.videoHistory.length) {
    elements.videoThread.className = "thread-stream video-thread-empty";
    elements.videoThread.innerHTML = "";
    return;
  }

  elements.videoThread.className = "thread-stream";
  elements.videoThread.innerHTML = state.videoHistory
    .map((entry) => {
      if (entry.role === "user") {
        return renderUserThreadCard(entry);
      }
      return renderVideoAssistantCard(entry);
    })
    .join("");
}

function renderUserThreadCard(entry) {
  const attachmentsMarkup = renderVideoAttachmentChips(entry.attachments);
  return `
    <article class="thread-item thread-item-user">
      <div class="thread-avatar">你</div>
      <div class="thread-bubble">
        <div class="thread-meta">
          <strong>提示词</strong>
          <span>${escapeHtml(formatThreadTime(entry.createdAt))}</span>
        </div>
        <p class="thread-text">${escapeHtml(entry.prompt || "")}</p>
        ${entry.contextPrompt ? `<p class="thread-subtext">基于上一轮：${escapeHtml(truncateText(entry.contextPrompt, 96))}</p>` : ""}
        ${entry.meta ? `<div class="thread-chip-row"><span class="thread-chip">${escapeHtml(entry.meta)}</span></div>` : ""}
        ${attachmentsMarkup}
      </div>
    </article>
  `;
}

function renderImageAssistantCard(entry) {
  const images = Array.isArray(entry.images) ? entry.images : [];
  const statusBadge = renderThreadStatusBadge(entry.status);
  const downgradeNotice = entry.downgradeNotice
    ? `<div class="thread-note thread-note-warning">${escapeHtml(entry.downgradeNotice)}</div>`
    : "";
  const imagesMarkup = images.length
    ? `
      <div class="thread-gallery">
        ${images
          .map(
            (image, index) => `
              <article class="thread-image-card">
                <div class="thread-image-frame">
                  <img src="${escapeAttribute(image.src)}" alt="图像结果 ${index + 1}" />
                </div>
                <div class="thread-image-body">
                  <p>${escapeHtml(image.prompt || `结果 ${index + 1}`)}</p>
                  <div class="thread-action-row">
                    <button
                      class="secondary-button thread-action-button"
                      type="button"
                      data-action="download-image"
                      data-src="${escapeAttribute(image.src)}"
                      data-filename="${escapeAttribute(image.filename || `image-${index + 1}.png`)}"
                    >
                      下载图片
                    </button>
                  </div>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
    `
    : `<div class="thread-placeholder">${escapeHtml(entry.summary || "正在等待图像结果")}</div>`;

  return `
    <article class="thread-item thread-item-assistant">
      <div class="thread-avatar">AI</div>
      <div class="thread-bubble">
        <div class="thread-meta">
          <strong>图像结果</strong>
          <span>${escapeHtml(formatThreadTime(entry.createdAt))}</span>
        </div>
        <div class="thread-chip-row">
          ${statusBadge}
          ${entry.meta ? `<span class="thread-chip">${escapeHtml(entry.meta)}</span>` : ""}
          ${entry.usedReferenceImage ? '<span class="thread-chip">已附带参考图</span>' : ""}
          ${typeof entry.rawPayload?.chargedAmount === "number" && entry.rawPayload.chargedAmount > 0 ? `<span class="thread-chip">已扣费 ${escapeHtml(formatAmount(entry.rawPayload.chargedAmount, entry.rawPayload.currency || "CNY"))}</span>` : ""}
        </div>
        ${entry.summary ? `<p class="thread-subtext">${escapeHtml(entry.summary)}</p>` : ""}
        ${downgradeNotice}
        ${imagesMarkup}
        <div class="thread-action-row">
          <button
            class="secondary-button thread-action-button"
            type="button"
            data-action="use-image-context"
            data-entry-id="${escapeAttribute(entry.id)}"
          >
            继续修改这组图片
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderVideoAssistantCard(entry) {
  const task = entry.task || {};
  const taskId = entry.taskId || task.taskId || task.id || "";
  const videoUrl = task.videoUrl || task.outputUrl || task.resultUrl || "";
  const videoUrlLabel = formatVideoUrlLabel(videoUrl);
  const attachmentsMarkup = renderVideoAttachmentChips(entry.attachments || task.attachments);
  const videoMarkup = videoUrl
    ? `
      <article class="thread-video-card">
        <div class="thread-video-frame">
          <video controls preload="metadata" playsinline src="${escapeAttribute(videoUrl)}"></video>
        </div>
        <div class="thread-video-body">
          <p>视频结果已返回，可以直接在这里预览。</p>
          <div class="thread-action-row">
            <button
              class="secondary-button thread-action-button"
              type="button"
              data-action="download-video"
              data-src="${escapeAttribute(videoUrl)}"
              data-filename="${escapeAttribute(`video-${taskId || formatCompactTime(task.updatedAt || task.createdAt || new Date().toISOString())}.mp4`)}"
            >
              下载视频
            </button>
            <a
              class="secondary-button thread-action-button"
              href="${escapeAttribute(videoUrl)}"
              target="_blank"
              rel="noreferrer"
            >
              新窗口打开视频
            </a>
          </div>
        </div>
      </article>
    `
    : `<div class="thread-placeholder">${escapeHtml(entry.summary || "任务已提交，等待状态更新。")}</div>`;
  return `
    <article class="thread-item thread-item-assistant">
      <div class="thread-avatar">AI</div>
      <div class="thread-bubble">
        <div class="thread-meta">
          <strong>视频任务</strong>
          <span>${escapeHtml(formatThreadTime(entry.createdAt))}</span>
        </div>
        <div class="thread-chip-row">
          ${renderThreadStatusBadge(entry.status)}
          ${entry.meta ? `<span class="thread-chip">${escapeHtml(entry.meta)}</span>` : ""}
          ${taskId ? `<span class="thread-chip">Task ${escapeHtml(taskId)}</span>` : ""}
          ${task.estimatedCharge ? `<span class="thread-chip">预计 ${escapeHtml(formatAmount(task.estimatedCharge, task.currency || "CNY"))}</span>` : ""}
          ${task.billingStatus === "charged" ? `<span class="thread-chip">已扣费 ${escapeHtml(formatAmount(task.chargedAmount, task.currency || "CNY"))}</span>` : ""}
        </div>
        ${attachmentsMarkup}
        ${entry.summary ? `<p class="thread-subtext">${escapeHtml(entry.summary)}</p>` : ""}
        ${videoMarkup}
        <div class="thread-task-grid">
          ${taskId ? `<div><span>任务 ID</span><strong>${escapeHtml(taskId)}</strong></div>` : ""}
          ${task.updatedAt || task.createdAt ? `<div><span>更新时间</span><strong>${escapeHtml(task.updatedAt || task.createdAt)}</strong></div>` : ""}
          ${videoUrl ? `
            <div>
              <span>视频地址</span>
              <a class="thread-task-link" href="${escapeAttribute(videoUrl)}" target="_blank" rel="noreferrer" title="${escapeAttribute(videoUrl)}">${escapeHtml(videoUrlLabel)}</a>
            </div>
          ` : ""}
        </div>
        ${taskId ? `
          <div class="thread-action-row">
            <button
              class="secondary-button thread-action-button"
              type="button"
              data-action="repoll-video"
              data-task-id="${escapeAttribute(taskId)}"
              data-entry-id="${escapeAttribute(entry.id)}"
            >
              立即刷新状态
            </button>
          </div>
        ` : ""}
      </div>
    </article>
  `;
}

function renderThreadStatusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  let tone = "pending";
  if (["paid", "success", "succeeded", "completed"].includes(normalized)) {
    tone = "success";
  } else if (["failed", "error", "cancelled", "empty", "billing_failed"].includes(normalized)) {
    tone = "error";
  }
  return `<span class="status-badge status-badge-${tone}">${escapeHtml(String(status || "--"))}</span>`;
}

function renderVideoAttachmentChips(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) {
    return "";
  }

  return `
    <div class="thread-chip-row">
      ${attachments
        .map((item) => `<span class="thread-chip">${escapeHtml(formatVideoAttachmentLabel(item))}</span>`)
        .join("")}
    </div>
  `;
}

function formatVideoAttachmentLabel(attachment) {
  const roleMap = {
    reference_image: "参考图",
    first_frame: "首帧",
    last_frame: "尾帧",
  };
  const role = roleMap[attachment?.role] || attachment?.role || "附件";
  const attachmentIndex = Number(attachment?.index);
  const suffix = Number.isFinite(attachmentIndex) ? ` ${attachmentIndex + 1}` : "";
  const name = attachment?.name ? truncateText(String(attachment.name), 18) : "未命名";
  return `${role}${suffix} · ${name}`;
}

function extractImageDowngradeNotice(payload) {
  const root = payload?.data || payload || {};
  const candidateFlags = [
    root.referenceImageDowngraded,
    root.reference_image_downgraded,
    root.downgraded,
    root.editDowngraded,
    root.edit_downgraded,
  ];

  if (candidateFlags.some(Boolean)) {
    return (
      root.referenceImageDowngradeReason ||
      root.reference_image_downgrade_reason ||
      root.downgradeReason ||
      root.warning ||
      root.message ||
      "参考图编辑已降级为纯文本续改，本次结果没有直接使用上一张图片作为输入。"
    );
  }

  const warnings = []
    .concat(root.warning || [])
    .concat(root.warnings || [])
    .concat(root.messages || [])
    .filter(Boolean)
    .map((item) => String(item));

  const matched = warnings.find((item) =>
    /downgrad|降级|reference image|参考图|text-only|text only/i.test(item),
  );
  return matched || "";
}

function renderKeyValueCard(container, rows) {
  if (!container) {
    return;
  }

  container.className = container.id === "payment-result" ? "payment-card" : "task-card";
  container.innerHTML = `
    <div class="kv-list">
      ${rows
        .map((row) => {
          if (row.type === "link") {
            return `
              <div class="kv-row">
                <strong>${escapeHtml(row.label)}</strong>
                <a href="${escapeAttribute(row.value)}" target="_blank" rel="noreferrer">${escapeHtml(row.value)}</a>
              </div>
            `;
          }

          if (row.type === "pre") {
            return `
              <div class="kv-row">
                <strong>${escapeHtml(row.label)}</strong>
                <pre>${escapeHtml(row.value)}</pre>
              </div>
            `;
          }

          return `
            <div class="kv-row">
              <strong>${escapeHtml(row.label)}</strong>
              <span>${escapeHtml(row.value)}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderPayment(payload) {
  const source = payload?.data || payload;
  const order = normalizeOrder(source);
  const paymentPayload = extractPaymentPayload(source);
  const payType = extractPayType(paymentPayload, order);
  const payInfo = extractPayInfo(paymentPayload);
  const paymentUrl = extractPaymentUrl(paymentPayload, payInfo);
  const mode = paymentPayload.integrationMode || "aggregated";

  const rows = [
    { label: "订单号", value: order.orderId || order.id || "--" },
    { label: "支付方式", value: formatPaymentMethodLabel(order.channel || order.method || payType) },
    { label: "金额", value: formatAmount(order.amount, order.currency) },
    { label: "接入模式", value: mode },
  ];

  if (payType) {
    rows.push({ label: "回执类型", value: formatPayTypeLabel(payType) });
  }
  if (paymentUrl) {
    rows.push({ label: "支付链接", value: paymentUrl, type: "link" });
  }
  if (payInfo && payInfo !== paymentUrl) {
    rows.push({
      label: buildPayInfoLabel(payType, payInfo),
      value: payInfo,
      type: isHttpUrl(payInfo) ? "link" : "pre",
    });
  }
  rows.push({
    label: "原始响应",
    value: JSON.stringify(payload, null, 2),
    type: "pre",
  });

  renderKeyValueCard(elements.paymentResult, rows);
}

function updateAccount(payload) {
  const root = payload?.data || payload || {};
  const account = root.account || payload?.account || root;
  const stats = root.stats || payload?.stats || {};
  const balance = account.balance ?? account.amount ?? account.credits ?? account.availableBalance ?? "--";
  const unit = account.currency || account.unit || "CNY";
  const meta =
    account.nickname ||
    account.userId ||
    account.email ||
    account.name ||
    "账户信息已更新";

  state.stats = {
    orderCount: stats.orderCount ?? state.stats.orderCount,
    pendingOrderCount: stats.pendingOrderCount ?? state.stats.pendingOrderCount,
    videoTaskCount: stats.videoTaskCount ?? state.stats.videoTaskCount,
  };

  if (elements.accountBalance) {
    elements.accountBalance.textContent =
      typeof balance === "number" ? formatCurrencyValue(balance) : String(balance);
  }
  if (elements.accountUnit) {
    elements.accountUnit.textContent = formatCurrencyUnit(unit);
  }
  if (elements.accountMeta) {
    elements.accountMeta.textContent = buildAccountMeta(meta, stats);
  }

  renderAccountSummary(account, stats);
  renderStats();
}

function buildAccountMeta(meta, stats) {
  const parts = [];
  if (meta) {
    parts.push(meta);
  }
  if (stats?.orderCount != null) {
    parts.push(`订单 ${stats.orderCount}`);
  }
  if (stats?.pendingOrderCount != null) {
    parts.push(`待支付 ${stats.pendingOrderCount}`);
  }
  if (stats?.videoTaskCount != null) {
    parts.push(`视频任务 ${stats.videoTaskCount}`);
  }
  return parts.join(" / ") || "账户信息已更新";
}

function renderAccountSummary(account, stats) {
  if (!elements.accountSummary) {
    return;
  }

  const items = [
    {
      label: "账户标识",
      value: account.nickname || account.userId || account.email || account.name || "默认账户",
    },
    {
      label: "结算单位",
      value: formatCurrencyUnit(account.currency || account.unit || "CNY"),
    },
    {
      label: "累计订单",
      value: stats.orderCount ?? state.recentOrders.length ?? "--",
    },
    {
      label: "待支付订单",
      value: stats.pendingOrderCount ?? countPendingOrders(state.recentOrders),
    },
    {
      label: "视频任务数",
      value: stats.videoTaskCount ?? state.recentVideoTasks.length ?? "--",
    },
  ];

  elements.accountSummary.className = "summary-list";
  elements.accountSummary.innerHTML = items
    .map(
      (item) => `
        <div class="summary-item">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(String(item.value))}</strong>
        </div>
      `,
    )
    .join("");
}

function renderStats() {
  if (elements.metricOrders) {
    elements.metricOrders.textContent = formatMetricValue(
      state.stats.orderCount,
      state.recentOrders.length || "--",
    );
  }
  if (elements.metricPendingOrders) {
    elements.metricPendingOrders.textContent = formatMetricValue(
      state.stats.pendingOrderCount,
      countPendingOrders(state.recentOrders),
    );
  }
  if (elements.metricVideoTasks) {
    elements.metricVideoTasks.textContent = formatMetricValue(
      state.stats.videoTaskCount,
      state.recentVideoTasks.length || "--",
    );
  }
}

function renderRecentOrders() {
  if (!elements.recentOrders) {
    return;
  }
  if (!state.recentOrders.length) {
    elements.recentOrders.className = "list-panel empty-state";
    elements.recentOrders.textContent = "暂无充值订单";
    return;
  }

  elements.recentOrders.className = "list-panel";
  elements.recentOrders.innerHTML = state.recentOrders
    .slice(0, MAX_RECENT_ITEMS)
    .map((item) => {
      const order = normalizeOrder(item);
      const status = order.status || "pending";
      return `
        <article class="list-item">
          <div class="list-item-head">
            <strong>${escapeHtml(order.subject || "账户余额充值")}</strong>
            ${renderStatusBadge(status)}
          </div>
          <div class="list-item-body">
            <div class="list-item-meta">
              <span>${escapeHtml(formatPaymentMethodLabel(order.channel || order.method || "--"))}</span>
              <span>${escapeHtml(formatAmount(order.amount, order.currency))}</span>
            </div>
            <p>${escapeHtml(order.orderId || order.id || order.outTradeNo || "--")}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRecentVideoTasks() {
  if (!elements.recentVideoTasks) {
    return;
  }
  if (!state.recentVideoTasks.length) {
    elements.recentVideoTasks.className = "list-panel empty-state";
    elements.recentVideoTasks.textContent = "暂无视频任务";
    return;
  }

  elements.recentVideoTasks.className = "list-panel";
  elements.recentVideoTasks.innerHTML = state.recentVideoTasks
    .slice(0, MAX_RECENT_ITEMS)
    .map((item) => {
      const task = normalizeTask(item);
      const status = task.status || "queued";
      return `
        <article class="list-item">
          <div class="list-item-head">
            <strong>${escapeHtml(task.prompt || "视频生成任务")}</strong>
            ${renderStatusBadge(status)}
          </div>
          <div class="list-item-body">
            <div class="list-item-meta">
              <span>${escapeHtml(task.model || "--")}</span>
              <span>${escapeHtml(task.id || task.taskId || "--")}</span>
            </div>
            <p>${escapeHtml(task.updatedAt || task.createdAt || "--")}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderStatusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  let tone = "pending";
  if (["paid", "success", "succeeded", "completed"].includes(normalized)) {
    tone = "success";
  } else if (["failed", "error", "cancelled", "billing_failed"].includes(normalized)) {
    tone = "error";
  }
  return `<span class="status-badge status-badge-${tone}">${escapeHtml(String(status || "--"))}</span>`;
}

function formatMetricValue(primary, fallback) {
  if (primary != null) {
    return String(primary);
  }
  return String(fallback);
}

function countPendingOrders(items) {
  return items.filter((item) => normalizeOrder(item).status === "pending").length;
}

function formatCurrencyValue(amount) {
  return (amount / 100).toFixed(2);
}

function formatCurrencyUnit(currency = "CNY") {
  return String(currency || "").toUpperCase() === "CNY" ? "元" : currency;
}

function formatAmount(amount, currency = "CNY") {
  if (typeof amount !== "number") {
    return "--";
  }
  if (String(currency || "").toUpperCase() === "CNY") {
    return `¥${formatCurrencyValue(amount)}`;
  }
  return `${formatCurrencyValue(amount)} ${currency}`;
}

function pushRecentOrder(order) {
  state.recentOrders = mergeRecentItems([normalizeOrder(order)], state.recentOrders, getOrderKey);
  renderRecentOrders();
  renderStats();
  saveCache();
}

function pushRecentVideoTask(task) {
  state.recentVideoTasks = mergeRecentItems([normalizeTask(task)], state.recentVideoTasks, getTaskKey);
  renderRecentVideoTasks();
  renderStats();
  saveCache();
}

function mergeRecentItems(nextItems, existingItems, keyFn) {
  const merged = [];
  const seen = new Set();

  for (const item of [...nextItems, ...existingItems]) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }

  return merged.slice(0, MAX_RECENT_ITEMS);
}

function normalizeOrder(item) {
  return {
    ...item,
    id: item?.id || item?.orderId || "",
    subject: item?.subject || item?.title || "账户余额充值",
    status: item?.status || "pending",
    channel:
      item?.channel ||
      item?.method ||
      item?.payType ||
      item?.pay_type ||
      item?.paymentPayload?.type ||
      "",
    amount: typeof item?.amount === "number" ? item.amount : Number(item?.amount || 0),
    currency: item?.currency || "CNY",
  };
}

function extractPaymentPayload(source) {
  const candidates = [
    source?.paymentPayload,
    source?.payment_payload,
    source?.payment,
    source?.gatewayPayload,
    source?.gateway_payload,
    source?.remote,
    source?.response?.data,
    source?.response,
    source?.result,
    source,
  ];
  return candidates.find((item) => item && typeof item === "object") || {};
}

function extractPayType(paymentPayload, order) {
  return String(
    paymentPayload?.pay_type ||
      paymentPayload?.payType ||
      paymentPayload?.type ||
      order?.payType ||
      order?.pay_type ||
      "",
  ).trim();
}

function extractPayInfo(paymentPayload) {
  const value =
    paymentPayload?.pay_info ??
    paymentPayload?.payInfo ??
    paymentPayload?.qrCode ??
    paymentPayload?.qr_code ??
    paymentPayload?.codeUrl ??
    paymentPayload?.code_url ??
    paymentPayload?.paymentUrl ??
    paymentPayload?.payUrl ??
    paymentPayload?.url ??
    paymentPayload?.cashierUrl ??
    paymentPayload?.mwebUrl ??
    "";

  if (typeof value === "string") {
    return value.trim();
  }
  if (value == null) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function extractPaymentUrl(paymentPayload, payInfo) {
  const directUrl =
    paymentPayload?.paymentUrl ||
    paymentPayload?.payUrl ||
    paymentPayload?.url ||
    paymentPayload?.cashierUrl ||
    paymentPayload?.mwebUrl ||
    "";
  if (directUrl) {
    return directUrl;
  }
  return isHttpUrl(payInfo) ? payInfo : "";
}

function formatPaymentMethodLabel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "wxpay" || normalized === "wechat") {
    return "微信支付";
  }
  if (normalized === "alipay") {
    return "支付宝";
  }
  return value || "--";
}

function formatPayTypeLabel(value) {
  const normalized = String(value || "").toLowerCase();
  const labels = {
    qrcode: "二维码文本",
    qr: "二维码文本",
    code: "二维码文本",
    url: "支付链接",
    link: "支付链接",
    jump: "跳转链接",
    redirect: "跳转链接",
    mweb: "移动端拉起链接",
    html: "HTML 表单",
    form: "HTML 表单",
  };
  return labels[normalized] || value || "--";
}

function buildPayInfoLabel(payType, payInfo) {
  const normalizedType = String(payType || "").toLowerCase();
  if (normalizedType === "html" || normalizedType === "form") {
    return "表单内容";
  }
  if (isHttpUrl(payInfo)) {
    return "回执地址";
  }
  if (normalizedType === "qrcode" || normalizedType === "qr" || normalizedType === "code") {
    return "二维码内容";
  }
  return "回执内容";
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function normalizeTask(item) {
  const request = item?.request || {};
  const remote = item?.remote || {};
  const remoteContent = remote?.content || {};
  const requestContent = Array.isArray(request?.content) ? request.content : [];
  const attachments = Array.isArray(item?.attachments) && item.attachments.length
    ? item.attachments
    : requestContent
      .filter((contentItem) => contentItem?.type === "image_url")
      .map((contentItem, index) => ({
        index,
        role: contentItem?.role || "reference_image",
        name: `图片 ${index + 1}`,
        url: contentItem?.image_url?.url || contentItem?.image_url || "",
      }));
  return {
    ...item,
    id: item?.id || item?.taskId || remote?.id || "",
    taskId: item?.taskId || item?.id || remote?.id || "",
    status: item?.status || remote?.status || "queued",
    prompt: request?.content?.[0]?.text || request?.prompt || item?.prompt || "",
    model: request?.model || item?.model || "",
    attachments,
    updatedAt: item?.updatedAt || remote?.updated_at || "",
    createdAt: item?.createdAt || "",
    progress: item?.progress ?? remote?.progress ?? "",
    videoUrl: item?.videoUrl || remote?.video_url || remoteContent?.video_url || "",
    outputUrl: item?.outputUrl || remote?.output_url || remoteContent?.output_url || "",
    resultUrl: item?.resultUrl || remote?.result_url || remoteContent?.result_url || "",
    estimatedCharge: item?.estimatedCharge ?? 0,
    chargedAmount: item?.chargedAmount ?? 0,
    currency: item?.currency || "CNY",
    billingStatus: item?.billingStatus || "",
    error: item?.error || remote?.error || remote?.err_msg || "",
    message: item?.message || remote?.message || remote?.msg || "",
  };
}

function getOrderKey(item) {
  return normalizeOrder(item).id || normalizeOrder(item).outTradeNo;
}

function getTaskKey(item) {
  return normalizeTask(item).id || normalizeTask(item).taskId;
}

function stopVideoPolling() {
  if (state.videoPollTimer) {
    clearTimeout(state.videoPollTimer);
    state.videoPollTimer = null;
  }
}

async function pollVideoTask(taskId, entryId = "") {
  stopVideoPolling();
  state.currentTaskId = taskId;

  try {
    const data = await requestJson(`/api/videos/tasks/${encodeURIComponent(taskId)}`);
    const task = normalizeTask(data?.data || data);
    pushRecentVideoTask(task);

    if (entryId) {
      updateVideoAssistantEntry(entryId, task, data);
    } else {
      upsertVideoHistoryByTask(task, data);
    }

    const status = String(task.status || "").toLowerCase();
    if (elements.videoStatus) {
      elements.videoStatus.textContent = status || "unknown";
    }

    if (!["succeeded", "success", "failed", "error", "completed", "billing_failed"].includes(status)) {
      state.videoPollTimer = window.setTimeout(() => pollVideoTask(taskId, entryId), 4000);
    }
  } catch (error) {
    if (elements.videoStatus) {
      elements.videoStatus.textContent = "查询失败";
    }
    setMessage(elements.videoMessage, error.message, true);
  }
}

function upsertVideoHistoryByTask(task, payload) {
  const existing = state.videoHistory.find((entry) => entry.taskId === task.taskId || entry.taskId === task.id);
  if (existing) {
    updateVideoAssistantEntry(existing.id, task, payload);
    return;
  }
  const entry = createThreadEntry("assistant", {
    kind: "video",
    status: task.status || "queued",
    prompt: task.prompt || "",
    meta: task.model ? `模型 ${task.model}` : "视频任务",
    attachments: task.attachments || [],
    taskId: task.taskId || task.id || "",
    task,
    rawPayload: payload,
    summary: buildVideoSummary(task),
  });
  pushThreadEntry("videoHistory", entry);
}

function buildVideoSummary(task) {
  const status = task.status || "queued";
  if (task.videoUrl || task.outputUrl || task.resultUrl) {
    if (task.billingStatus === "charged") {
      return `任务 ${status}，结果地址已返回，已扣费 ${formatAmount(task.chargedAmount, task.currency)}。`;
    }
    if (task.billingStatus === "failed") {
      return task.message || "任务已完成，但扣费失败。";
    }
    if (task.estimatedCharge) {
      return `任务 ${status}，结果地址已返回，预计费用 ${formatAmount(task.estimatedCharge, task.currency)}。`;
    }
    return `任务 ${status}，结果地址已返回。`;
  }
  if (task.billingStatus === "failed") {
    return task.message || "任务已完成，但扣费失败。";
  }
  if (task.error || task.message) {
    return task.error || task.message;
  }
  if (task.progress !== "" && task.progress != null) {
    return `任务 ${status}，当前进度 ${task.progress}。`;
  }
  return `任务 ${status}，等待继续轮询。`;
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatThreadTime(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCompactTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "result";
  }
  const pad = (input) => String(input).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function focusPromptField(form) {
  const field = form?.querySelector('textarea[name="prompt"]');
  field?.focus();
}

async function handleVideoAttachmentInputChange(event) {
  const input = event.currentTarget;
  const files = Array.from(input?.files || []);
  if (!files.length) {
    return;
  }

  try {
    const role = state.videoPendingAttachmentRole || "reference_image";
    const attachments = await Promise.all(files.map((file) => readVideoAttachmentFile(file, role)));
    state.videoComposerAttachments = [...state.videoComposerAttachments, ...attachments];
    if (role === "reference_image") {
      appendVideoAttachmentMentions(attachments);
    }
    renderVideoAttachmentPanel();
    setMessage(elements.videoMessage, `已添加 ${attachments.length} 张${formatVideoAttachmentRoleLabel(role)}到本次视频请求。`);
  } catch (error) {
    setMessage(elements.videoMessage, error.message, true);
  } finally {
    if (input) {
      input.value = "";
    }
    state.videoPendingAttachmentRole = "reference_image";
  }
}

function readVideoAttachmentFile(file, role = "reference_image") {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return Promise.reject(new Error("只能添加图片附件。"));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        reject(new Error(`读取附件失败：${file.name}`));
        return;
      }
      resolve({
        id: createId(),
        name: file.name || "image",
        type: file.type || "image/png",
        size: file.size || 0,
        role,
        dataUrl,
      });
    };
    reader.onerror = () => reject(new Error(`读取附件失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function updateVideoAttachmentRole(attachmentId, role) {
  state.videoComposerAttachments = state.videoComposerAttachments.map((item) =>
    item.id === attachmentId ? { ...item, role } : item,
  );
  renderVideoAttachmentPanel();
}

function removeVideoAttachment(attachmentId) {
  state.videoComposerAttachments = state.videoComposerAttachments.filter((item) => item.id !== attachmentId);
  renderVideoAttachmentPanel();
}

function clearVideoComposerAttachments() {
  state.videoComposerAttachments = [];
  renderVideoAttachmentPanel();
}

function appendVideoAttachmentMentions(attachments) {
  const field = elements.videoPromptField;
  if (!field || !attachments.length) {
    return;
  }

  const existing = String(field.value || "").trim();
  const startIndex = Math.max(state.videoComposerAttachments.length - attachments.length, 0);
  const mentions = attachments
    .map((_, index) => buildVideoAttachmentMention(startIndex + index))
    .join(" ");

  field.value = existing ? `${existing} ${mentions}` : mentions;
}

function renderVideoAttachmentPanel() {
  if (!elements.videoAttachmentPanel) {
    return;
  }

  const attachments = state.videoComposerAttachments;
  if (!attachments.length) {
    elements.videoAttachmentPanel.className = "attachment-panel is-empty field-wide";
    elements.videoAttachmentPanel.innerHTML = "";
    hideVideoMentionMenu();
    if (elements.videoComposerHint) {
      elements.videoComposerHint.textContent = "可以走 @图片 参考模式，也可以分别上传首帧和尾帧。";
    }
    return;
  }

  elements.videoAttachmentPanel.className = "attachment-panel field-wide";
  elements.videoAttachmentPanel.innerHTML = `
    <div class="attachment-strip">
      ${attachments
        .map(
          (item, index) => `
            <article class="attachment-pill">
              <div class="attachment-pill-thumb">
                <img src="${escapeAttribute(item.dataUrl)}" alt="${escapeAttribute(item.name)}" />
              </div>
              <div class="attachment-pill-copy">
                <strong>${escapeHtml(item.role === "reference_image" ? buildVideoAttachmentMention(index) : formatVideoAttachmentRoleLabel(item.role))}</strong>
                <span title="${escapeAttribute(item.name)}">${escapeHtml(item.name)}</span>
              </div>
              <label class="attachment-pill-role">
                <select data-action="change-video-attachment-role" data-attachment-id="${escapeAttribute(item.id)}">
                  ${renderVideoAttachmentRoleOptions(item.role)}
                </select>
              </label>
              <button
                class="attachment-pill-remove"
                type="button"
                data-action="remove-video-attachment"
                data-attachment-id="${escapeAttribute(item.id)}"
                aria-label="移除图片"
              >
                <span class="material-symbols-outlined text-[16px]">close</span>
              </button>
            </article>
          `,
        )
        .join("")}
    </div>
  `;

  if (elements.videoComposerHint) {
    elements.videoComposerHint.textContent = `本次会附带 ${attachments.length} 张图片，可分别作为参考图、首帧或尾帧。`;
  }
  renderVideoMentionMenu();
}

function renderVideoAttachmentRoleOptions(selectedRole) {
  const roles = [
    { value: "reference_image", label: "参考图 / @图片" },
    { value: "first_frame", label: "首帧" },
    { value: "last_frame", label: "尾帧" },
  ];

  return roles
    .map((item) => {
      const selected = item.value === selectedRole ? " selected" : "";
      return `<option value="${escapeAttribute(item.value)}"${selected}>${escapeHtml(item.label)}</option>`;
    })
    .join("");
}

function formatVideoAttachmentRoleLabel(role) {
  if (role === "first_frame") {
    return "首帧";
  }
  if (role === "last_frame") {
    return "尾帧";
  }
  return "参考图";
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return "--";
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatVideoUrlLabel(url) {
  if (!url) {
    return "";
  }
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const filename = parts[parts.length - 1] || parsed.hostname;
    return `${parsed.hostname}/.../${filename}`;
  } catch {
    return url;
  }
}

function renderVideoMentionMenu() {
  const field = elements.videoPromptField;
  const menu = elements.videoMentionMenu;
  if (!field || !menu) {
    return;
  }

  const mentionState = getVideoMentionState(field);
  const candidates = getVideoMentionCandidates(mentionState?.query || "");
  if (!mentionState || !candidates.length) {
    hideVideoMentionMenu();
    return;
  }

  menu.innerHTML = candidates
    .map(
      (item) => `
        <button class="video-mention-option" type="button" data-video-mention-index="${item.index}">
          <span class="video-mention-thumb"><img src="${escapeAttribute(item.dataUrl)}" alt="${escapeAttribute(item.name)}" /></span>
          <span class="video-mention-copy">
            <strong>${escapeHtml(buildVideoAttachmentMention(item.index))}</strong>
            <span title="${escapeAttribute(item.name)}">${escapeHtml(item.name)}</span>
          </span>
        </button>
      `,
    )
    .join("");
  menu.classList.remove("is-hidden");
}

function hideVideoMentionMenu() {
  elements.videoMentionMenu?.classList.add("is-hidden");
}

function getVideoMentionState(field) {
  const value = String(field.value || "");
  const cursor = Number.isFinite(field.selectionStart) ? field.selectionStart : value.length;
  const left = value.slice(0, cursor);
  const atIndex = left.lastIndexOf("@");
  if (atIndex < 0) {
    return null;
  }
  const query = left.slice(atIndex + 1);
  if (query.includes(" ") || query.includes("\n")) {
    return null;
  }
  return { start: atIndex, end: cursor, query };
}

function getVideoMentionCandidates(query) {
  const normalized = String(query || "").trim().toLowerCase();
  return state.videoComposerAttachments
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.role === "reference_image")
    .filter((item) => {
      if (!normalized) {
        return true;
      }
      return buildVideoAttachmentMention(item.index).toLowerCase().includes(`@${normalized}`)
        || String(item.name || "").toLowerCase().includes(normalized);
    });
}

function insertVideoMention(index) {
  const field = elements.videoPromptField;
  if (!field) {
    return;
  }
  const mentionState = getVideoMentionState(field);
  if (!mentionState) {
    return;
  }

  const mention = buildVideoAttachmentMention(index);
  const value = String(field.value || "");
  const prefix = value.slice(0, mentionState.start);
  const suffix = value.slice(mentionState.end);
  const spacer = suffix.startsWith(" ") || !suffix ? "" : " ";
  field.value = `${prefix}${mention}${spacer}${suffix}`;
  const nextCursor = prefix.length + mention.length + spacer.length;
  field.focus();
  field.setSelectionRange(nextCursor, nextCursor);
  hideVideoMentionMenu();
}

async function downloadImage(src, filename) {
  if (src.startsWith("data:")) {
    triggerDownload(src, filename);
    return;
  }

  try {
    const response = await fetch(src);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    triggerDownload(blobUrl, filename);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch {
    window.open(src, "_blank", "noopener,noreferrer");
  }
}

function triggerDownload(src, filename) {
  const link = document.createElement("a");
  link.href = src;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
