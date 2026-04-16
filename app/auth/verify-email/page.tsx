"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authAPI, apiClient } from "@/lib/api"
import { Loader2, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function VerifyEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
  if (!token) {
    setStatus('error')
    setMessage('Invalid verification link')
    return
  }

  verifyEmail(token)
  }, [searchParams])

  const verifyEmail = async (token: string) => {
    try {
      const response = await authAPI.verifyEmail({ token })

      if (response.access_token) {
      apiClient.setToken(response.access_token)
    }
    if (response.refresh_token && typeof window !== 'undefined') {
      localStorage.setItem('refresh_token', response.refresh_token)
    }

    setStatus('success')
    setMessage('Email verified successfully! Redirecting to dashboard...')
    setTimeout(() => router.push('/dashboard'), 2000)
    } catch (error) {
      setStatus('error')
      setMessage('Invalid or expired verification link')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-xl text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Verifying Your Email</h2>
            <p className="text-text-secondary">Please wait while we verify your email address...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2 text-green-600">Email Verified!</h2>
            <p className="text-text-secondary mb-4">{message}</p>
            <div className="w-full bg-border rounded-full h-1 mb-2">
              <div className="bg-green-500 h-1 rounded-full animate-pulse" style={{ width: '100%' }} />
            </div>
            <p className="text-sm text-text-secondary">Redirecting...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2 text-red-600">Verification Failed</h2>
            <p className="text-text-secondary mb-6">{message}</p>
            <div className="flex gap-4 justify-center">
              <Button
                onClick={() => router.push('/auth/register')}
                variant="outline"
              >
                Register Again
              </Button>
              <Button
                onClick={() => router.push('/auth/login')}
              >
                Go to Login
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
