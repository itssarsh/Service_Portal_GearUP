import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import {
  API_CALL_TYPE,
  CHAT_API,
} from "../../services/api";
import makeApiCall from "../../services/api";
import {
  getChatRoute,
  getDashboardRoute,
  getLoginRoute,
  getStoredToken,
  getStoredUser,
} from "../../utils/session";
import { formatDisplayDate } from "../../utils/formatters";
import "./Chat.css";

const maxUploadBytes = 5 * 1024 * 1024;

function getMessageDayValue(value) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  parsedDate.setHours(0, 0, 0, 0);
  return parsedDate;
}

function formatMessageTime(value) {
  if (!value) {
    return "Time unavailable";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

function formatMessageDayLabel(value) {
  const messageDay = getMessageDayValue(value);

  if (!messageDay) {
    return "Date unavailable";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (messageDay.getTime() === today.getTime()) {
    return "Today";
  }

  if (messageDay.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }

  return formatDisplayDate(value, "Date unavailable");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export default function CustomerChatPage() {
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const currentUser = useMemo(() => getStoredUser(), []);
  const messageListRef = useRef(null);

  const selectedMechanicId = searchParams.get("mechanicId");
  const selectedVehicleId = searchParams.get("vehicleId");
  const selectedServiceRecordId = searchParams.get("serviceRecordId");
  const selectedMechanicName = searchParams.get("mechanicName");

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, activeThread]);

  useEffect(() => {
    if (!getStoredToken()) {
      navigate(getLoginRoute(), { replace: true });
      return;
    }

    const loadThreads = async () => {
      try {
        const loadedThreads = await makeApiCall(
          API_CALL_TYPE.GET_CALL,
          CHAT_API.threads,
          null,
          (error) => {
            toast.error(error.response?.data?.error || "Failed to load chat.");
          },
          "",
          null,
          {},
          { skipGlobalLoader: true }
        );

        setThreads(loadedThreads || []);

        if (selectedMechanicId || selectedVehicleId || selectedServiceRecordId) {
          const openedThread = await makeApiCall(
            API_CALL_TYPE.POST_CALL,
            CHAT_API.threads,
            null,
            (error) => {
              toast.error(error.response?.data?.error || "Unable to open mechanic chat.");
            },
            "",
            null,
            {
              mechanicId: selectedMechanicId ? Number(selectedMechanicId) : undefined,
              vehicleId: selectedVehicleId ? Number(selectedVehicleId) : undefined,
              serviceRecordId: selectedServiceRecordId
                ? Number(selectedServiceRecordId)
                : undefined,
            },
            { skipGlobalLoader: true }
          );

          if (openedThread?.id) {
            setActiveThread(openedThread);
            setThreads((previousThreads) => {
              const remainingThreads = previousThreads.filter(
                (thread) => thread.id !== openedThread.id
              );
              return [openedThread, ...remainingThreads];
            });
          } else if (loadedThreads?.length > 0) {
            setActiveThread(loadedThreads[0]);
          }

          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete("mechanicId");
          nextParams.delete("vehicleId");
          nextParams.delete("serviceRecordId");
          nextParams.delete("mechanicName");
          setSearchParams(nextParams, { replace: true });
          return;
        }

        if (loadedThreads?.length > 0) {
          setActiveThread(loadedThreads[0]);
        }
      } finally {
        setIsBootstrapping(false);
      }
    };

    loadThreads().catch(() => {
      setIsBootstrapping(false);
    });
  }, [
    navigate,
    searchParams,
    selectedMechanicId,
    selectedServiceRecordId,
    selectedVehicleId,
    setSearchParams,
    toast,
  ]);

  useEffect(() => {
    if (!getStoredToken()) {
      return undefined;
    }

    let isMounted = true;

    const pollThreads = () =>
      makeApiCall(
        API_CALL_TYPE.GET_CALL,
        CHAT_API.threads,
        (response) => {
          if (!isMounted) {
            return;
          }

          const nextThreads = response || [];
          setThreads(nextThreads);
          setActiveThread((previousThread) => {
            if (previousThread?.id) {
              return nextThreads.find((thread) => thread.id === previousThread.id) || previousThread;
            }

            return nextThreads[0] || null;
          });
        },
        null,
        "",
        null,
        {},
        { skipGlobalLoader: true }
      ).catch(() => undefined);

    const intervalId = window.setInterval(() => {
      pollThreads();
    }, 6000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!activeThread?.id) {
      setMessages([]);
      return undefined;
    }

    let isMounted = true;

    const loadMessages = (silent = false) => {
      if (!silent) {
        setIsLoadingMessages(true);
      }

      return makeApiCall(
        API_CALL_TYPE.GET_CALL,
        CHAT_API.threadMessages(activeThread.id),
        (response) => {
          if (!isMounted) {
            return;
          }

          setActiveThread(response.thread);
          setMessages(response.messages || []);
          if (!silent) {
            setIsLoadingMessages(false);
          }
        },
        (error) => {
          if (!silent) {
            setIsLoadingMessages(false);
            toast.error(error.response?.data?.error || "Failed to load messages.");
          }
        },
        "",
        null,
        {},
        { skipGlobalLoader: silent }
      ).catch(() => {
        if (!silent) {
          setIsLoadingMessages(false);
        }
      });
    };

    loadMessages(false);
    const intervalId = window.setInterval(() => {
      loadMessages(true);
    }, 4000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [activeThread?.id, toast]);

  const handleThreadSelect = (thread) => {
    setActiveThread(thread);
    navigate(getChatRoute(), { replace: true });
  };

  const handleImageSelection = async (event) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    if (!selectedFile.type.startsWith("image/")) {
      toast.error("Only image files can be attached.");
      event.target.value = "";
      return;
    }

    if (selectedFile.size > maxUploadBytes) {
      toast.error("Image must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(selectedFile);

      setPendingImage({
        fileName: selectedFile.name,
        previewUrl: dataUrl,
        dataUrl,
      });
    } catch (error) {
      toast.error(error.message || "Failed to read image.");
    } finally {
      event.target.value = "";
    }
  };

  const resetComposer = () => {
    setMessageText("");
    setPendingImage(null);
  };

  const handleSendMessage = async () => {
    if (!activeThread?.id || isSending) {
      return;
    }

    if (!messageText.trim() && !pendingImage) {
      toast.error("Enter a message or attach an image.");
      return;
    }

    setIsSending(true);

    try {
      const createdMessage = await makeApiCall(
        API_CALL_TYPE.POST_CALL,
        CHAT_API.threadMessages(activeThread.id),
        null,
        (error) => {
          toast.error(error.response?.data?.error || "Failed to send message.");
        },
        "",
        null,
        {
          messageText,
          imageDataUrl: pendingImage?.dataUrl,
          imageName: pendingImage?.fileName,
        }
      );

      if (!createdMessage) {
        return;
      }

      setMessages((previousMessages) => [...previousMessages, createdMessage]);
      setThreads((previousThreads) => {
        const updatedThread = {
          ...activeThread,
          last_message_text: createdMessage.message_text,
          last_message_image_url: createdMessage.image_url,
          last_message_at: createdMessage.created_at,
          updated_at: createdMessage.created_at,
        };
        const remainingThreads = previousThreads.filter((thread) => thread.id !== activeThread.id);
        return [updatedThread, ...remainingThreads];
      });
      setActiveThread((previousThread) =>
        previousThread
          ? {
              ...previousThread,
              last_message_text: createdMessage.message_text,
              last_message_image_url: createdMessage.image_url,
              last_message_at: createdMessage.created_at,
              updated_at: createdMessage.created_at,
            }
          : previousThread
      );
      resetComposer();
    } finally {
      setIsSending(false);
    }
  };

  const emptyStateCopy =
    selectedMechanicName || activeThread?.mechanic_name || "Mechanic conversations";
  const normalizedSearchValue = searchValue.trim().toLowerCase();
  const visibleThreads = normalizedSearchValue
    ? threads.filter((thread) => {
        const searchableText = [
          thread.mechanic_name,
          thread.mechanic_phone,
          thread.registration_number,
          thread.brand,
          thread.model,
          thread.service_type,
          thread.last_message_text,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearchValue);
      })
    : threads;

  return (
    <section className="chat-page">
      <div className="chat-page__backdrop"></div>

      <div className="chat-shell">
        <header className="chat-header">
          <div>
            <p className="chat-header__eyebrow">Workshop Communication</p>
            <h1>Keep customer-to-workshop communication structured, searchable, and tied to the right vehicle.</h1>
            <p className="chat-header__copy">
              Use one thread per service context to share updates, proofs, images, and follow-up instructions without losing context.
            </p>
          </div>

          <div className="chat-header__actions">
            <Link
              className="add-product-hero__back"
              to={getDashboardRoute()}
            >
              Back to Dashboard
            </Link>
          </div>
        </header>

        <div className="chat-layout">
          <aside className="chat-sidebar">
            <div className="chat-sidebar__heading">
              <h2>Active conversations</h2>
              <span>{threads.length}</span>
            </div>

            <label className="chat-sidebar__search">
              <span>Find mechanic</span>
              <input
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search by name, phone, reg. number"
                type="text"
                value={searchValue}
              />
            </label>

            <div className="chat-thread-list">
              {isBootstrapping ? (
                <div className="chat-empty-state chat-empty-state--sidebar">
                  Loading conversations...
                </div>
              ) : visibleThreads.length > 0 ? (
                visibleThreads.map((thread) => (
                  <button
                    className={`chat-thread-card${
                      activeThread?.id === thread.id ? " chat-thread-card--active" : ""
                    }`}
                    key={thread.id}
                    onClick={() => handleThreadSelect(thread)}
                    type="button"
                  >
                    <div className="chat-thread-card__top">
                      <div>
                        <strong>{thread.mechanic_name || "Mechanic"}</strong>
                        <span>
                          {thread.registration_number
                            ? `${thread.registration_number} · ${thread.brand || ""} ${thread.model || ""}`.trim()
                            : thread.service_type || "Open thread"}
                        </span>
                      </div>
                      <time>{formatDisplayDate(thread.last_message_at || thread.updated_at)}</time>
                    </div>
                    <p>
                      {thread.last_message_text ||
                        (thread.last_message_image_url
                          ? "Image shared"
                          : "Conversation ready")}
                    </p>
                  </button>
                ))
              ) : (
                <div className="chat-empty-state chat-empty-state--sidebar">
                  {threads.length > 0
                    ? "No matching conversations found."
                    : "No conversations yet. Start one from service history when you need a workshop update."}
                </div>
              )}
            </div>
          </aside>

          <section className="chat-panel">
            {activeThread ? (
              <>
                <div className="chat-panel__header">
                  <div>
                    <h2>{activeThread.mechanic_name || selectedMechanicName || "Mechanic"}</h2>
                    <p>
                      {activeThread.registration_number
                        ? `${activeThread.registration_number} · ${activeThread.service_type || "Service updates"}`
                        : activeThread.service_type || "Direct service conversation"}
                    </p>
                  </div>

                  <div className="chat-panel__meta">
                    <span>{activeThread.mechanic_phone || "Phone not available"}</span>
                    <strong>{currentUser?.name || "Customer"}</strong>
                  </div>
                </div>

                <div className="chat-messages" ref={messageListRef}>
                  {isLoadingMessages ? (
                    <div className="chat-empty-state">Loading messages...</div>
                  ) : messages.length > 0 ? (
                    messages.map((message, index) => {
                      const isOwnMessage = Number(message.sender_id) === Number(currentUser?.id);
                      const previousMessage = messages[index - 1];
                      const currentMessageDay = getMessageDayValue(message.created_at);
                      const previousMessageDay = getMessageDayValue(previousMessage?.created_at);
                      const shouldShowDayDivider =
                        currentMessageDay &&
                        (!previousMessageDay ||
                          currentMessageDay.getTime() !== previousMessageDay.getTime());

                      return (
                        <Fragment key={message.id}>
                          {shouldShowDayDivider ? (
                            <div className="chat-message-day">
                              <span>{formatMessageDayLabel(message.created_at)}</span>
                            </div>
                          ) : null}

                          <article
                            className={`chat-message${
                              isOwnMessage ? " chat-message--own" : " chat-message--incoming"
                            }`}
                          >
                            <div className="chat-message__bubble">
                              <div className="chat-message__meta">
                                <strong>{isOwnMessage ? "You" : message.sender_name || "Mechanic"}</strong>
                                <time dateTime={message.created_at || undefined}>
                                  {formatMessageTime(message.created_at)}
                                </time>
                              </div>

                              {message.message_text ? <p>{message.message_text}</p> : null}

                              {message.image_url ? (
                                <a
                                  className="chat-message__image-link"
                                  href={message.image_url}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <img alt={message.image_name || "Chat upload"} src={message.image_url} />
                                </a>
                              ) : null}
                            </div>
                          </article>
                        </Fragment>
                      );
                    })
                  ) : (
                    <div className="chat-empty-state">
                      No messages yet. Ask for an update, confirm a detail, or share an image here.
                    </div>
                  )}
                </div>

                <div className="chat-composer">
                  {pendingImage ? (
                    <div className="chat-composer__attachment">
                      <img alt={pendingImage.fileName} src={pendingImage.previewUrl} />
                      <div>
                        <strong>{pendingImage.fileName}</strong>
                        <span>Ready to send</span>
                      </div>
                      <button onClick={() => setPendingImage(null)} type="button">
                        Remove
                      </button>
                    </div>
                  ) : null}

                  <textarea
                    className="chat-composer__input"
                    onChange={(event) => setMessageText(event.target.value)}
                    placeholder="Write a clear message for the workshop team, request an update, or add issue details..."
                    rows={4}
                    value={messageText}
                  />

                  <div className="chat-composer__actions">
                    <label className="chat-composer__upload">
                      <input accept="image/*" onChange={handleImageSelection} type="file" />
                      Attach Proof
                    </label>
                    <button onClick={handleSendMessage} type="button">
                      {isSending ? "Sending..." : "Send Update"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="chat-empty-state chat-empty-state--panel">
                <strong>{emptyStateCopy}</strong>
                <p>
                  Open chat from dashboard service history to start a direct conversation with
                  the assigned mechanic or workshop contact.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
