import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import { API_CALL_TYPE, CREATE_CHAT_THREAD_API, GET_CHAT_THREAD_MESSAGES_API, GET_CHAT_THREADS_API, SEND_CHAT_MESSAGE_API, } from "../../services/Api";
import makeApiCall from "../../services/ApiService";
import { showApiError } from "../../utils/apiError";
import { getLoginRoute, getStoredToken, getStoredUser, } from "../../utils/session";
import { formatDisplayDate } from "../../utils/formatters";
import "./Chat.css";

const maxUploadBytes = 5 * 1024 * 1024;

function formatMessageTime(value) {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getMessageDayKey(value) {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`;
}

function formatMessageDayLabel(value) {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  const currentDay = new Date();
  currentDay.setHours(0, 0, 0, 0);

  const messageDay = new Date(parsedDate);
  messageDay.setHours(0, 0, 0, 0);

  const dayDifference = Math.round((currentDay.getTime() - messageDay.getTime()) / (1000 * 60 * 60 * 24));

  if (dayDifference === 0) {
    return "Today";
  }

  if (dayDifference === 1) {
    return "Yesterday";
  }

  return formatDisplayDate(parsedDate, "");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export default function MechanicChatPage() {
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

  const selectedCustomerId = searchParams.get("customerId");
  const selectedVehicleId = searchParams.get("vehicleId");
  const selectedServiceRecordId = searchParams.get("serviceRecordId");
  const selectedCustomerName = searchParams.get("customerName");

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

    const handleAuthError = (error) => {
      showApiError(toast, error, "Failed to load chat.");
    };

    const loadThreads = async () => {
      try {
        const loadedThreads = await makeApiCall(
          API_CALL_TYPE.GET_CALL,
          GET_CHAT_THREADS_API(),
          null,
          handleAuthError
        );

        setThreads(loadedThreads);

        if (selectedCustomerId || selectedVehicleId || selectedServiceRecordId) {
          const openedThread = await makeApiCall(
            API_CALL_TYPE.POST_CALL,
            CREATE_CHAT_THREAD_API(),
            null,
            (error) => {
              showApiError(toast, error, "Unable to open customer chat.");
            },
            "",
            null,
            {
              customerId: selectedCustomerId ? Number(selectedCustomerId) : undefined,
              vehicleId: selectedVehicleId ? Number(selectedVehicleId) : undefined,
              serviceRecordId: selectedServiceRecordId
                ? Number(selectedServiceRecordId)
                : undefined,
            }
          );

          if (openedThread?.id) {
            setActiveThread(openedThread);
            setThreads((previousThreads) => {
              const remainingThreads = previousThreads.filter(
                (thread) => thread.id !== openedThread.id
              );
              return [openedThread, ...remainingThreads];
            });
          } else if (loadedThreads.length > 0) {
            setActiveThread(loadedThreads[0]);
          }

          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete("customerId");
          nextParams.delete("vehicleId");
          nextParams.delete("serviceRecordId");
          nextParams.delete("customerName");
          setSearchParams(nextParams);

          return;
        }

        if (loadedThreads.length > 0) {
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
    selectedCustomerId,
    selectedServiceRecordId,
    selectedVehicleId,
    setSearchParams,
    toast,
  ]);

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
        GET_CHAT_THREAD_MESSAGES_API(activeThread.id),
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

  useEffect(() => {
    if (!getStoredToken()) {
      return undefined;
    }

    let isMounted = true;

    const pollThreads = () =>
      makeApiCall(
        API_CALL_TYPE.GET_CALL,
        GET_CHAT_THREADS_API(),
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

  const handleThreadSelect = (thread) => {
    setActiveThread(thread);
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
      toast.error("Enter a message or attach a damage photo.");
      return;
    }

    setIsSending(true);

    try {
      const createdMessage = await makeApiCall(
        API_CALL_TYPE.POST_CALL,
        SEND_CHAT_MESSAGE_API(activeThread.id),
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
    selectedCustomerName || activeThread?.customer_name || "Customer conversations";
  const normalizedSearchValue = searchValue.trim().toLowerCase();
  const visibleThreads = normalizedSearchValue
    ? threads.filter((thread) => {
      const searchableText = [
        thread.customer_name,
        thread.customer_phone,
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
  const timelineMessages = useMemo(
    () =>
      messages.map((message, index) => {
        const previousMessage = messages[index - 1];
        const messageDayKey = getMessageDayKey(message.created_at);
        const previousMessageDayKey = getMessageDayKey(previousMessage?.created_at);

        return {
          ...message,
          dayLabel: formatMessageDayLabel(message.created_at),
          showDateSeparator: index === 0 || messageDayKey !== previousMessageDayKey,
        };
      }),
    [messages]
  );

  return (
    <section className="chat-page">
      <div className="chat-page__backdrop"></div>

      <div className="chat-shell">

        <div className="chat-layout">
          <aside className="chat-sidebar">
            <div className="chat-sidebar__heading">
              <h2>Conversations</h2>
              <span>{threads.length}</span>
            </div>

            <label className="chat-sidebar__search">
              <span>Find customer</span>
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
                    className={`chat-thread-card${activeThread?.id === thread.id ? " chat-thread-card--active" : ""
                      }`}
                    key={thread.id}
                    onClick={() => handleThreadSelect(thread)}
                    type="button"
                  >
                    <div className="chat-thread-card__top">
                      <div>
                        <strong>{thread.customer_name || "Customer"}</strong>
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
                          ? "Damage photo shared"
                          : "Start the conversation")}
                    </p>
                  </button>
                ))
              ) : (
                <div className="chat-empty-state chat-empty-state--sidebar">
                  {threads.length > 0
                    ? "No matching conversations found."
                    : "No conversations yet. Use the Open Chat button at the top of the dashboard."}
                </div>
              )}
            </div>
          </aside>

          <section className="chat-panel">
            {activeThread ? (
              <>
                <div className="chat-panel__header">
                  <div>
                    <h2>{activeThread.customer_name || selectedCustomerName || "Customer"}</h2>
                    <p>
                      {activeThread.registration_number
                        ? `${activeThread.registration_number} · ${activeThread.service_type || "Service updates"}`
                        : activeThread.service_type || "Direct repair conversation"}
                    </p>
                  </div>

                  <div className="chat-panel__meta">
                    <span>{activeThread.customer_phone || "Phone not available"}</span>
                    <strong>{currentUser?.name || "Mechanic"}</strong>
                  </div>
                </div>

                <div className="chat-messages" ref={messageListRef}>
                  {isLoadingMessages ? (
                    <div className="chat-empty-state">Loading messages...</div>
                  ) : timelineMessages.length > 0 ? (
                    timelineMessages.map((message) => {
                      const isOwnMessage = Number(message.sender_id) === Number(currentUser?.id);

                      return (
                        <Fragment key={message.id}>
                          {message.showDateSeparator ? (
                            <div className="chat-message__day-separator">
                              <span>{message.dayLabel}</span>
                            </div>
                          ) : null}

                          <article
                            className={`chat-message${isOwnMessage ? " chat-message--own" : " chat-message--incoming"
                              }`}
                          >
                            <div className="chat-message__bubble">
                              <div className="chat-message__meta">
                                <strong>{isOwnMessage ? "You" : message.sender_name || "Customer"}</strong>
                                <span>{formatMessageTime(message.created_at)}</span>
                              </div>

                              {message.message_text ? <p>{message.message_text}</p> : null}

                              {message.image_url ? (
                                <a
                                  className="chat-message__image-link"
                                  href={message.image_url}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <img alt={message.image_name || "Damage proof"} src={message.image_url} />
                                </a>
                              ) : null}
                            </div>
                          </article>
                        </Fragment>
                      );
                    })
                  ) : (
                    <div className="chat-empty-state">
                      No messages yet. Share a repair update or attach a damage proof image.
                    </div>
                  )}
                </div>

                <div className="chat-composer">
                  {pendingImage ? (
                    <div className="chat-composer__attachment">
                      <img alt={pendingImage.fileName} src={pendingImage.previewUrl} />
                      <div>
                        <strong>{pendingImage.fileName}</strong>
                        <span>Ready to send as damage proof</span>
                      </div>
                      <button onClick={() => setPendingImage(null)} type="button">
                        Remove
                      </button>
                    </div>
                  ) : null}

                  <textarea
                    className="chat-composer__input"
                    onChange={(event) => setMessageText(event.target.value)}
                    placeholder="Type a repair update, ask for approval, or explain the issue..."
                    rows={4}
                    value={messageText}
                  />

                  <div className="chat-composer__actions">
                    <label className="chat-composer__upload">
                      <input accept="image/*" onChange={handleImageSelection} type="file" />
                      Attach Image
                    </label>
                    <button onClick={handleSendMessage} type="button">
                      {isSending ? "Sending..." : "Send Message"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="chat-empty-state chat-empty-state--panel">
                <strong>{emptyStateCopy}</strong>
                <p>
                  Open chat from the dashboard customer list to start a direct conversation and
                  share proof photos.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
