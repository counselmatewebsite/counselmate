"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/context/auth-context"
import { bookingsAPI, paymentsAPI, profilesAPI, usersAPI } from "@/lib/api"
import { realtimeAPI, type FeeRequest, type HandshakeAgreement, type WSStoredMessage } from "@/lib/api/realtime"
import type { Booking } from "@/lib/api/bookings"
import type { ProfileContactMessage } from "@/lib/api/profiles"
import type { User } from "@/lib/api/types"
import { Send, Phone, Mic, MicOff, MessageSquare, IndianRupee, Check, X, Loader2 } from "lucide-react"
import { toast } from "sonner"

type WSMessageType =
  | "chat"
  | "call_offer"
  | "call_answer"
  | "ice_candidate"
  | "call_end"
  | "session_start"
  | "session_end"
  | "typing_start"
  | "typing_stop"

interface WSMessage {
  type: WSMessageType
  booking_id: string
  sender_id?: string
  receiver_id?: string
  content?: string
  sdp_offer?: string
  sdp_answer?: string
  ice_candidate?: string
  timestamp?: string
}

type RazorpayCheckoutOptions = {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  handler: () => void
  theme?: { color?: string }
}

type RazorpayPaymentOrder = {
  razorpay_key_id: string
  order_id: string
  amount: number
  currency?: string
}

type RazorpayCtor = new (options: RazorpayCheckoutOptions) => { open: () => void }

const getRazorpayWindow = () => window as Window & { Razorpay?: RazorpayCtor }

const formatRelativeTime = (iso: string) => {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - then) / 1000))

  if (diffSec < 60) return "just now"
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

const contactStatusBadgeClasses: Record<ProfileContactMessage["status"], string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  ACCEPTED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-700",
}

export default function MessagesPage() {
  const { user, isAuthenticated } = useAuth()
  const searchParams = useSearchParams()
  const consultantQuery = searchParams.get("consultant")

  const [bookings, setBookings] = useState<Booking[]>([])
  const [contactMessages, setContactMessages] = useState<ProfileContactMessage[]>([])
  const [senderUsers, setSenderUsers] = useState<Record<string, User>>({})
  const [loadingBookings, setLoadingBookings] = useState(false)
  const [selected, setSelected] = useState<Booking | null>(null)
  const [selectedContactMessage, setSelectedContactMessage] = useState<ProfileContactMessage | null>(null)
  const [respondingContactMessageId, setRespondingContactMessageId] = useState<string | null>(null)

  const [messages, setMessages] = useState<WSStoredMessage[]>([])
  const [messageInput, setMessageInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)

  const [handshake, setHandshake] = useState<HandshakeAgreement | null>(null)
  const [handshakeByBooking, setHandshakeByBooking] = useState<Record<string, HandshakeAgreement | null>>({})
  const [termsOpen, setTermsOpen] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

  const [feeRequests, setFeeRequests] = useState<FeeRequest[]>([])
  const [feeModalOpen, setFeeModalOpen] = useState(false)
  const [feeAmount, setFeeAmount] = useState("1000")
  const [feeNote, setFeeNote] = useState("Legal consultation fee")

  const [callOpen, setCallOpen] = useState(false)
  const [chatPaneInCall, setChatPaneInCall] = useState(true)
  const [, setInCall] = useState(false)
  const [muted, setMuted] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const isProfessional = (user?.role || "").toString().toUpperCase() === "PROFESSIONAL"

  const visibleBookings = useMemo(() => {
    if (!user) return []
    return bookings.filter((b) => {
      if (b.user_id === b.consultant_id) return false
      return b.user_id === user.id || b.consultant_id === user.id
    })
  }, [bookings, user])

  const incomingRequests = useMemo(() => {
    if (!user) return []
    return visibleBookings.filter((b) => {
      const hs = handshakeByBooking[b.id]
      return hs?.status === "PENDING" && hs.responder_id === user.id
    })
  }, [handshakeByBooking, user, visibleBookings])

  const activeConversations = useMemo(() => {
    return visibleBookings.filter((b) => handshakeByBooking[b.id]?.status === "ACTIVE")
  }, [handshakeByBooking, visibleBookings])

  const pendingSentRequests = useMemo(() => {
    if (!user) return []
    return visibleBookings.filter((b) => {
      const hs = handshakeByBooking[b.id]
      return hs?.status === "PENDING" && hs.requester_id === user.id
    })
  }, [handshakeByBooking, user, visibleBookings])

  const sortedContactMessages = useMemo(() => {
    const statusWeight: Record<ProfileContactMessage["status"], number> = {
      PENDING: 0,
      ACCEPTED: 1,
      REJECTED: 2,
    }

    return [...contactMessages].sort((a, b) => {
      const statusDelta = statusWeight[a.status] - statusWeight[b.status]
      if (statusDelta !== 0) return statusDelta
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [contactMessages])

  const counterpartId = useMemo(() => {
    if (!selected || !user) return ""
    return isProfessional ? selected.user_id : selected.consultant_id
  }, [isProfessional, selected, user])

  const wsUrl = useMemo(() => {
    if (!selected) return ""
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080/api"
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") || "" : ""
    const role = isProfessional ? "consultant" : "user"
    try {
      const u = new URL(apiBase)
      const protocol = u.protocol === "https:" ? "wss:" : "ws:"
      const path = `${u.pathname.replace(/\/$/, "")}/ws/chat`
      const params = new URLSearchParams({ booking: selected.id, role })
      if (token) params.set("token", token)
      return `${protocol}//${u.host}${path}?${params.toString()}`
    } catch {
      return ""
    }
  }, [isProfessional, selected])

  const sendWS = useCallback((msg: WSMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error("Socket not connected")
      return
    }
    wsRef.current.send(JSON.stringify(msg))
  }, [])

  const loadBookings = useCallback(async () => {
    if (!isAuthenticated || !user) return
    setLoadingBookings(true)
    try {
      const data = isProfessional
        ? await bookingsAPI.getConsultantBookings(1, 50)
        : await bookingsAPI.getMyBookings(1, 50)

      if (isProfessional) {
        const contactData = await profilesAPI.listContactMessages()
        setContactMessages(contactData.messages || [])
      }

      const fetchedBookings = (data.bookings || []).filter((b) => {
        // Never allow self-thread rows.
        if (b.user_id === b.consultant_id) return false
        if (isProfessional) return b.consultant_id === user.id
        return b.user_id === user.id
      })

      setBookings(fetchedBookings)

      const handshakeEntries = await Promise.all(
        fetchedBookings.map(async (b) => {
          const hs = await realtimeAPI.getHandshakeStatus(b.id)
          return [b.id, hs] as const
        }),
      )
      const handshakeMap = Object.fromEntries(handshakeEntries)
      setHandshakeByBooking(handshakeMap)

      if (!selected && fetchedBookings.length) {
        if (consultantQuery && consultantQuery === user.id) {
          toast.error("You cannot message yourself")
        }

        const deepLinked = consultantQuery
          ? fetchedBookings.find((b) => b.consultant_id === consultantQuery)
          : undefined

        const firstIncoming = isProfessional
          ? fetchedBookings.find((b) => {
              const hs = handshakeMap[b.id]
              return hs?.status === "PENDING" && hs.responder_id === user.id
            })
          : undefined

        setSelected(deepLinked || firstIncoming || fetchedBookings[0])
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load conversations")
    } finally {
      setLoadingBookings(false)
    }
  }, [consultantQuery, isAuthenticated, isProfessional, selected, user])

  const openAcceptedConversation = useCallback(async (message: ProfileContactMessage) => {
  if (!message.booking_id) {
    toast.error("No conversation thread is linked to this request yet")
    return
  }

  let targetBooking = bookings.find((b) => b.id === message.booking_id)

  if (!targetBooking && user) {
    const data = isProfessional
      ? await bookingsAPI.getConsultantBookings(1, 50)
      : await bookingsAPI.getMyBookings(1, 50)

    const fetchedBookings = (data.bookings || []).filter((b) => {
      if (b.user_id === b.consultant_id) return false
      if (isProfessional) return b.consultant_id === user.id
      return b.user_id === user.id
    })

    setBookings(fetchedBookings)
    targetBooking = fetchedBookings.find((b) => b.id === message.booking_id)
  }

  if (!targetBooking) {
    toast.error("Conversation booking not found yet. Please refresh and try again.")
    return
  }

  setSelectedContactMessage(null)
  setSelected(targetBooking)
  }, [bookings, isProfessional, user])

  const respondContactMessage = async (messageId: string, accept: boolean) => {
  setRespondingContactMessageId(messageId)
    try {
      const res = await profilesAPI.respondContactMessage(messageId, accept)
      setContactMessages((prev) => prev.map((m) => (m.id === messageId ? res.contact_message : m)))
      setSelectedContactMessage((prev) => (prev && prev.id === messageId ? res.contact_message : prev))
    if (accept && res.contact_message.booking_id) {
    await openAcceptedConversation(res.contact_message)
    }
      toast.success(accept ? "Request accepted" : "Request denied")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to respond to request")
  } finally {
    setRespondingContactMessageId(null)
    }
  }

  const loadThreadData = useCallback(async (booking: Booking) => {
    setChatLoading(true)
    try {
      const [msgs, hs, fees] = await Promise.all([
        realtimeAPI.getMessages(booking.id, 250),
        realtimeAPI.getHandshakeStatus(booking.id),
        realtimeAPI.getFeeRequests(booking.id),
      ])
      setMessages(msgs)
      setHandshake(hs)
      setHandshakeByBooking((prev) => ({ ...prev, [booking.id]: hs }))
      setFeeRequests(fees)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load thread")
    } finally {
      setChatLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  useEffect(() => {
    if (!selected) return
    loadThreadData(selected)
  }, [loadThreadData, selected])

  useEffect(() => {
    if (!isProfessional || contactMessages.length === 0) return

    const uniqueSenderIDs = Array.from(new Set(contactMessages.map((m) => m.sender_user_id)))
    const missingSenderIDs = uniqueSenderIDs.filter((id) => !senderUsers[id])
    if (missingSenderIDs.length === 0) return

    Promise.all(
      missingSenderIDs.map(async (id) => {
        try {
          const sender = await usersAPI.getUser(id)
          return [id, sender] as const
        } catch {
          return [id, null] as const
        }
      }),
    ).then((entries) => {
      setSenderUsers((prev) => {
        const next = { ...prev }
        for (const [id, sender] of entries) {
          if (sender) next[id] = sender
        }
        return next
      })
    })
  }, [contactMessages, isProfessional, senderUsers])

  useEffect(() => {
  if (!visibleBookings.length) return

  const counterpartIDs = Array.from(
    new Set(visibleBookings.map((b) => (isProfessional ? b.user_id : b.consultant_id))),
  )
  const missingIDs = counterpartIDs.filter((id) => !senderUsers[id])
  if (missingIDs.length === 0) return

  Promise.all(
    missingIDs.map(async (id) => {
      try {
        const sender = await usersAPI.getUser(id)
        return [id, sender] as const
      } catch {
        return [id, null] as const
      }
    }),
  ).then((entries) => {
    setSenderUsers((prev) => {
      const next = { ...prev }
      for (const [id, sender] of entries) {
        if (sender) next[id] = sender
      }
      return next
    })
  })
  }, [isProfessional, senderUsers, visibleBookings])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (!selected || handshake?.status !== "ACTIVE") {
      wsRef.current?.close()
      wsRef.current = null
      return
    }
    if (!wsUrl) return

    const socket = new WebSocket(wsUrl)
    wsRef.current = socket

    socket.onmessage = async (event) => {
      const msg = JSON.parse(event.data) as WSMessage
      if (msg.type === "chat" && msg.content) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            booking_id: msg.booking_id,
            sender_id: msg.sender_id || "unknown",
            content: msg.content || "",
            created_at: msg.timestamp || new Date().toISOString(),
          },
        ])
      }

      if (msg.type === "call_offer" && msg.sdp_offer) {
        setCallOpen(true)
        await ensureMedia()
        const pc = ensurePeerConnection()
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(msg.sdp_offer)))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        sendWS({
          type: "call_answer",
          booking_id: selected.id,
          receiver_id: msg.sender_id,
          sdp_answer: JSON.stringify(answer),
        })
        setInCall(true)
      }

      if (msg.type === "call_answer" && msg.sdp_answer && pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(JSON.parse(msg.sdp_answer)))
      }

      if (msg.type === "ice_candidate" && msg.ice_candidate && pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(JSON.parse(msg.ice_candidate)))
      }

      if (msg.type === "call_end") {
        endCall()
      }
    }

    socket.onopen = () => toast.success("Realtime connected")
    socket.onclose = () => toast("Realtime disconnected")

    return () => {
      socket.close()
    }
  }, [handshake?.status, selected, sendWS, wsUrl])

  const ensurePeerConnection = () => {
    if (pcRef.current) return pcRef.current
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] })
    pc.ontrack = () => {}
    pc.onicecandidate = (event) => {
      if (!event.candidate || !selected) return
      sendWS({
        type: "ice_candidate",
        booking_id: selected.id,
        receiver_id: counterpartId || undefined,
        ice_candidate: JSON.stringify(event.candidate),
      })
    }
    pcRef.current = pc
    return pc
  }

  const ensureMedia = async () => {
    if (localStreamRef.current) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    localStreamRef.current = stream
    const pc = ensurePeerConnection()
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))
  }

  const startCall = async () => {
    if (!selected) return
    if (handshake?.status !== "ACTIVE") {
      setTermsOpen(true)
      return
    }
    try {
      setCallOpen(true)
      await ensureMedia()
      const pc = ensurePeerConnection()
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendWS({
        type: "call_offer",
        booking_id: selected.id,
        receiver_id: counterpartId || undefined,
        sdp_offer: JSON.stringify(offer),
      })
      setInCall(true)
    } catch {
      toast.error("Failed to start call")
    }
  }

  const endCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    setInCall(false)
    setCallOpen(false)
  }

  const sendChat = () => {
    if (!selected || !messageInput.trim()) return
    if (handshake?.status !== "ACTIVE") {
      setTermsOpen(true)
      return
    }

    sendWS({
      type: "chat",
      booking_id: selected.id,
      receiver_id: counterpartId || undefined,
      content: messageInput.trim(),
    })

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        booking_id: selected.id,
        sender_id: user?.id || "me",
        content: messageInput.trim(),
        created_at: new Date().toISOString(),
      },
    ])
    setMessageInput("")
  }

  const requestHandshake = async () => {
    if (!selected) return
    if (isProfessional) {
      toast.error("Professionals can only accept or deny incoming requests")
      return
    }
    if (!termsAccepted) {
      toast.error("Please agree to terms first")
      return
    }
    try {
      const hs = await realtimeAPI.requestHandshake(selected.id, "v1")
      setHandshake(hs)
      setHandshakeByBooking((prev) => ({ ...prev, [selected.id]: hs }))
      setTermsOpen(false)
      toast.success("Message request sent")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send handshake")
    }
  }

  const respondHandshake = async (accept: boolean) => {
    if (!selected) return
    try {
      const hs = await realtimeAPI.respondHandshake(selected.id, accept)
      setHandshake(hs)
      setHandshakeByBooking((prev) => ({ ...prev, [selected.id]: hs }))
      toast.success(accept ? "Request accepted" : "Request rejected")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to respond")
    }
  }

  const createFeeRequest = async () => {
    if (!selected) return
    try {
      const req = await realtimeAPI.createFeeRequest(selected.id, Number(feeAmount), feeNote)
      setFeeRequests((prev) => [req, ...prev])
      setFeeModalOpen(false)
      toast.success("Fee request sent")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create request")
    }
  }

  const ensureRazorpayScript = async () => {
    if (getRazorpayWindow().Razorpay) return true
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script")
      s.src = "https://checkout.razorpay.com/v1/checkout.js"
      s.onload = () => resolve()
      s.onerror = () => reject(new Error("Failed to load Razorpay"))
      document.body.appendChild(s)
    })
    return !!getRazorpayWindow().Razorpay
  }

  const payFeeRequest = async (req: FeeRequest) => {
    if (!selected) return
    try {
      await realtimeAPI.respondFeeRequest(req.id, true)
      const order = await paymentsAPI.createPaymentOrder({
        service_id: selected.service_id,
        consultant_id: selected.consultant_id,
        amount: req.amount_rupees,
      }) as RazorpayPaymentOrder

      const loaded = await ensureRazorpayScript()
      const win = getRazorpayWindow()
      if (!loaded || !win.Razorpay) {
        toast.success("Payment order created. Razorpay UI not available in this browser.")
        return
      }

      const options = {
        key: order.razorpay_key_id,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "CounselMate",
        description: `Legal fee • Booking ${selected.id}`,
        order_id: order.order_id,
        handler: () => {
          toast.success("Payment initiated successfully")
        },
        theme: { color: "#2563eb" },
      }
  const razorpay = new win.Razorpay(options)
      razorpay.open()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed")
    }
  }

  const otherPartyLabel = (b: Booking) => {
    if (!isProfessional) {
      const counterpart = senderUsers[b.consultant_id]
      const name = b.consultant
        ? `${b.consultant.first_name} ${b.consultant.last_name}`
        : counterpart
          ? `${counterpart.first_name || ""} ${counterpart.last_name || ""}`.trim() || counterpart.email
          : `Consultant ${b.consultant_id.slice(0, 6)}`
      return name
    }
    const counterpart = senderUsers[b.user_id]
    return counterpart
      ? `${counterpart.first_name || ""} ${counterpart.last_name || ""}`.trim() || counterpart.email
      : `Client ${b.user_id.slice(0, 8)}`
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-xl border bg-white p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isProfessional ? "Message Requests" : "Messages"}</h2>
            {loadingBookings && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>

          {isProfessional && (
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming requests</div>
          )}
          <div className="space-y-2">
            {isProfessional && sortedContactMessages.length > 0 && (
              <>
                {sortedContactMessages.map((m) => (
                  (() => {
                    const sender = senderUsers[m.sender_user_id]
                    const senderName = sender
                      ? `${sender.first_name || ""} ${sender.last_name || ""}`.trim() || sender.email
                      : `User ${m.sender_user_id.slice(0, 8)}`
                    return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedContactMessage(m)
                      setSelected(null)
                    }}
                    className={`w-full rounded-lg border p-3 text-left ${selectedContactMessage?.id === m.id ? "border-blue-600 bg-blue-50" : "hover:bg-slate-50"}`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      {sender?.profile_picture && (
                        <img src={sender.profile_picture} alt={senderName} className="h-6 w-6 rounded-full object-cover" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-800">{senderName}</div>
                        {sender?.email && <div className="truncate text-[11px] text-slate-500">{sender.email}</div>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{m.subject}</div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${contactStatusBadgeClasses[m.status]}`}>
                        {m.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{m.message.slice(0, 120)}{m.message.length > 120 ? "…" : ""}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{formatRelativeTime(m.created_at)}</div>
                  </button>
                    )
                  })()
                ))}
                <div className="my-2 border-t" />
              </>
            )}

            {(isProfessional ? incomingRequests : visibleBookings).map((b) => {
              const hs = handshakeByBooking[b.id]
              const status = hs?.status || "NO_REQUEST"
              const counterpart = senderUsers[isProfessional ? b.user_id : b.consultant_id]
              return (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className={`w-full rounded-lg border p-3 text-left ${selected?.id === b.id ? "border-blue-600 bg-blue-50" : "hover:bg-slate-50"}`}
                >
                  <div className="font-medium">{otherPartyLabel(b)}</div>
                  {counterpart?.email && <div className="mt-1 text-[11px] text-slate-500">{counterpart.email}</div>}
                  <div className="mt-1 text-xs text-slate-500">Booking #{b.id.slice(0, 8)} • {b.status}</div>
                  {status !== "NO_REQUEST" && <div className="mt-1 text-[11px] font-medium text-slate-600">{status}</div>}
                </button>
              )
            })}
            {isProfessional && pendingSentRequests.length > 0 && (
              <div className="pt-2 text-xs text-slate-500">{pendingSentRequests.length} request(s) awaiting user response.</div>
            )}
            {!visibleBookings.length && !contactMessages.length && !loadingBookings && <div className="text-sm text-slate-500">No real messages yet.</div>}
            {isProfessional && visibleBookings.length > 0 && incomingRequests.length === 0 && (
              <div className="text-sm text-slate-500">No incoming requests right now.</div>
            )}
          </div>

          {!isProfessional && activeConversations.length > 0 && (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {activeConversations.length} active conversation(s)
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white">
          {selectedContactMessage ? (
            <div className="p-6">
              {(() => {
                const sender = senderUsers[selectedContactMessage.sender_user_id]
                const senderName = sender
                  ? `${sender.first_name || ""} ${sender.last_name || ""}`.trim() || sender.email
                  : `User ${selectedContactMessage.sender_user_id.slice(0, 8)}`
                return (
                  <div className="mb-3 flex items-center gap-3 rounded-lg border bg-slate-50 p-3">
                    {sender?.profile_picture && <img src={sender.profile_picture} alt={senderName} className="h-10 w-10 rounded-full object-cover" />}
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{senderName}</div>
                      {sender?.email && <div className="text-xs text-slate-500">{sender.email}</div>}
                    </div>
                  </div>
                )
              })()}
              <h3 className="text-lg font-semibold">{selectedContactMessage.subject}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selectedContactMessage.message}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${contactStatusBadgeClasses[selectedContactMessage.status]}`}>
                  {selectedContactMessage.status}
                </span>
                <span className="text-xs text-slate-500">{formatRelativeTime(selectedContactMessage.created_at)}</span>
              </div>
              {isProfessional && selectedContactMessage.status === "PENDING" && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => respondContactMessage(selectedContactMessage.id, true)}
                    disabled={respondingContactMessageId === selectedContactMessage.id}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <Check className="mr-1 inline h-3 w-3" /> Accept
                  </button>
                  <button
                    onClick={() => respondContactMessage(selectedContactMessage.id, false)}
                    disabled={respondingContactMessageId === selectedContactMessage.id}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <X className="mr-1 inline h-3 w-3" /> Deny
                  </button>
                </div>
              )}
              {selectedContactMessage.status === "ACCEPTED" && selectedContactMessage.booking_id && (
				<div className="mt-4">
				  <button
					onClick={() => openAcceptedConversation(selectedContactMessage)}
					className="rounded-md border px-3 py-2 text-sm"
				  >
					Open chat & calls
				  </button>
				</div>
			  )}
            </div>
          ) : !selected ? (
            <div className="p-6 text-slate-500">Select a conversation to start.</div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b p-4">
                <div>
                  <div className="font-semibold">{otherPartyLabel(selected)}</div>
                  <div className="text-xs text-slate-500">Booking #{selected.id.slice(0, 8)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => startCall()} className="rounded-md border p-2 hover:bg-slate-50" disabled={handshake?.status !== "ACTIVE"}><Phone className="h-4 w-4" /></button>
                  {isProfessional && (
                    <button onClick={() => setFeeModalOpen(true)} className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50">Request Payment</button>
                  )}
                </div>
              </div>

              <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
                <div className="space-y-3">
                  <div className="min-h-[340px] max-h-[420px] space-y-2 overflow-auto rounded-lg border bg-slate-50 p-3">
                    {chatLoading ? (
                      <div className="text-sm text-slate-500">Loading messages...</div>
                    ) : messages.length === 0 ? (
                      <div className="text-sm text-slate-500">No messages yet.</div>
                    ) : (
                      messages.map((m) => {
                        const mine = m.sender_id === user?.id
                        return (
                          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[78%] rounded-xl px-3 py-2 text-sm ${mine ? "bg-blue-600 text-white" : "bg-white border"}`}>
                              <div>{m.content}</div>
                              <div className={`mt-1 text-[11px] ${mine ? "text-blue-100" : "text-slate-500"}`}>{new Date(m.created_at).toLocaleTimeString()}</div>
                            </div>
                          </div>
                        )
                      })
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendChat()}
                      placeholder={handshake?.status === "ACTIVE" ? "Type a message..." : isProfessional ? "Accept request to start chat" : "Send request first to start chat"}
                      className="h-11 flex-1 rounded-md border px-3"
                    />
                    <button onClick={sendChat} className="h-11 rounded-md bg-blue-600 px-4 text-white"><Send className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border p-3">
                    <div className="mb-2 text-sm font-semibold">Message request status</div>
                    {handshake?.status === "ACTIVE" ? (
                      <div className="text-sm text-green-700">✅ Request accepted. You can now message and call.</div>
                    ) : handshake?.status === "PENDING" ? (
                      <div className="space-y-2">
                        <div className="text-sm text-amber-700">
                          {handshake.responder_id === user?.id
                            ? "New message request received. Accept or deny below."
                            : "Your message request is pending acceptance."}
                        </div>
                        {handshake.responder_id === user?.id && (
                          <div className="flex gap-2">
                            <button onClick={() => respondHandshake(true)} className="rounded-md border px-3 py-1 text-sm"><Check className="mr-1 inline h-3 w-3" />Accept</button>
                            <button onClick={() => respondHandshake(false)} className="rounded-md border px-3 py-1 text-sm"><X className="mr-1 inline h-3 w-3" />Reject</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => setTermsOpen(true)}
                        className="rounded-md border px-3 py-2 text-sm"
                        disabled={isProfessional}
                      >
                        {isProfessional ? "Waiting for user request" : "Open terms & send request"}
                      </button>
                    )}
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="mb-2 text-sm font-semibold">Fee Requests</div>
                    <div className="space-y-2">
                      {feeRequests.map((r) => (
                        <div key={r.id} className="rounded-md border p-2 text-sm">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">₹{r.amount_rupees}</div>
                            <div className="text-xs text-slate-500">{r.status}</div>
                          </div>
                          <div className="text-xs text-slate-500">Platform: ₹{r.platform_fee_rupees} • Pro payout: ₹{r.consultant_payout_rupees}</div>
                          {r.notes && <div className="mt-1 text-xs">{r.notes}</div>}
                          {!isProfessional && r.status === "PENDING" && (
                            <button onClick={() => payFeeRequest(r)} className="mt-2 rounded-md bg-emerald-600 px-3 py-1 text-xs text-white"><IndianRupee className="mr-1 inline h-3 w-3" />Pay now</button>
                          )}
                        </div>
                      ))}
                      {feeRequests.length === 0 && <div className="text-xs text-slate-500">No fee requests yet.</div>}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {termsOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5">
            <h3 className="text-lg font-semibold">Terms & Conditions for Messaging / Calls</h3>
            <div className="mt-3 max-h-60 overflow-auto rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
              <p>1. Both parties must agree before any messaging or voice communication.</p>
              <p className="mt-2">2. Communication is for legal/professional consultation purposes only.</p>
              <p className="mt-2">3. Payment terms and platform fees are displayed before payment.</p>
              <p className="mt-2">4. Abuse, harassment, and non-compliant behavior may lead to account action.</p>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
              I agree to the terms and conditions
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setTermsOpen(false)}>Cancel</button>
              <button className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white" onClick={requestHandshake}>Agree & Request Handshake</button>
            </div>
          </div>
        </div>
      )}

      {feeModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5">
            <h3 className="text-lg font-semibold">Request Legal Fee</h3>
            <div className="mt-3 space-y-2">
              <input value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} className="h-10 w-full rounded-md border px-3" placeholder="Amount in INR" />
              <textarea value={feeNote} onChange={(e) => setFeeNote(e.target.value)} className="w-full rounded-md border p-2" rows={3} placeholder="Notes" />
              <div className="text-xs text-slate-600">Platform fee ≈ 5%, consultant payout ≈ 95% (computed in backend).</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setFeeModalOpen(false)}>Cancel</button>
              <button className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white" onClick={createFeeRequest}>Send Request</button>
            </div>
          </div>
        </div>
      )}

      {callOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="grid h-[84vh] w-full max-w-6xl grid-cols-1 gap-4 rounded-xl bg-slate-900 p-4 text-white lg:grid-cols-[1fr_360px]">
            <div className="relative flex items-center justify-center rounded-lg bg-black">
              <div className="flex flex-col items-center gap-2 rounded-xl border border-white/20 bg-slate-900/60 px-8 py-10">
                <Phone className="h-10 w-10 text-emerald-400" />
                <div className="text-lg font-semibold">Audio call in progress</div>
                <div className="text-sm text-slate-300">Your microphone is connected via secure realtime channel.</div>
              </div>
              <div className="absolute left-1/2 bottom-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-2">
                <button
                  onClick={() => {
                    const t = localStreamRef.current?.getAudioTracks()[0]
                    if (!t) return
                    t.enabled = !t.enabled
                    setMuted(!t.enabled)
                  }}
                  className={`rounded-full p-3 ${muted ? "bg-red-600" : "bg-slate-700"}`}
                >
                  {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
                <button onClick={() => setChatPaneInCall((v) => !v)} className="rounded-full bg-slate-700 p-3"><MessageSquare className="h-4 w-4" /></button>
                <button
                  onClick={() => {
                    if (selected) sendWS({ type: "call_end", booking_id: selected.id, receiver_id: counterpartId || undefined })
                    endCall()
                  }}
                  className="rounded-full bg-red-600 px-4 py-3 text-sm"
                >
                  End
                </button>
              </div>
            </div>

            {chatPaneInCall && (
              <div className="flex h-full flex-col rounded-lg border border-white/20 bg-slate-950/60 p-3">
                <div className="mb-2 text-sm font-semibold">In-call chat</div>
                <div className="flex-1 space-y-2 overflow-auto text-xs">
                  {messages.slice(-80).map((m) => (
                    <div key={m.id} className={`rounded p-2 ${m.sender_id === user?.id ? "bg-blue-700" : "bg-slate-700"}`}>{m.content}</div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input value={messageInput} onChange={(e) => setMessageInput(e.target.value)} className="h-9 flex-1 rounded border border-white/20 bg-transparent px-2 text-sm" placeholder="Type..." />
                  <button onClick={sendChat} className="rounded bg-blue-600 px-3 text-sm">Send</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}