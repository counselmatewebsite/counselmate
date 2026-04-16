'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, AlertCircle, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/context/auth-context';
import { authAPI, paymentsAPI } from '@/lib/api';
import { useRazorpayCheckout } from '@/lib/hooks/use-razorpay-checkout';
import { toast } from 'sonner';

export default function RegisterProfessionalPage() {
  const router = useRouter();
  const { register } = useAuth();
  const { openCheckout } = useRazorpayCheckout();
  const [step, setStep] = useState<'profession' | 'details' | 'credentials' | 'payment'>(
    'profession'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [profession, setProfession] = useState<string>('');
  const [upiId, setUpiId] = useState<string>('');
  const [registrationComplete, setRegistrationComplete] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    first_name: '',
    last_name: '',
    profession_type: '' as 'CA' | 'LAWYER' | 'CONSULTANT',
  });

  const professions = [
    {
      id: 'CA',
      title: 'Chartered Accountant',
      description:
        'CAs handle tax planning, audits, financial advisory, and regulatory compliance.',
      icon: '📊',
    },
    {
      id: 'CONSULTANT',
      title: 'Consultant',
      description:
        'Business, management, and strategic consultants advising on growth and operations.',
      icon: '💼',
    },
    {
      id: 'LAWYER',
      title: 'Lawyer',
      description: 'Legal practitioners handling contracts, litigation support, documentation, and advisory.',
      icon: '⚖️',
    },
  ];

  const handleSelectProfession = (profType: string) => {
    setProfession(profType);
    setFormData({ ...formData, profession_type: profType as any });
    setStep('details');
  };

  const handleBackToProfession = () => {
    setStep('profession');
    setError('');
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (): boolean => {
    setError('');

    if (!formData.first_name.trim()) {
      setError('First name is required');
      return false;
    }

    if (!formData.last_name.trim()) {
      setError('Last name is required');
      return false;
    }

    if (!formData.email.trim()) {
      setError('Email is required');
      return false;
    }

    if (!validateEmail(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }

    const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
    if (!passwordRule.test(formData.password)) {
      setError('Password must include uppercase, lowercase, number, and special character');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { confirmPassword, ...registerData } = formData;
      const registerResult = await register({
        ...registerData,
        role: 'PROFESSIONAL',
      });

      if (registerResult.verificationRequired) {
        toast.success('Account created! Check your email to verify your account, then login to continue.');
        router.push('/auth/login');
        return;
      }

      toast.success('Account created! Proceeding to payment...');
      // Move to payment step instead of redirecting immediately
      setStep('payment');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create account';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authAPI.getGoogleAuthUrl();

      if (data.auth_url) {
        // Store the profession type in sessionStorage so it can be retrieved after Google redirect
        sessionStorage.setItem('pendingProfessionType', formData.profession_type);
        sessionStorage.setItem('pendingRole', 'PROFESSIONAL');
        window.location.href = data.auth_url;
      }
    } catch (err) {
      const message = 'Failed to initiate Google signup';
      setError(message);
      toast.error(message);
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!upiId.trim()) {
      setError('Please enter your UPI ID');
      return;
    }

    // Validate UPI ID format (simple validation)
    const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
    if (!upiRegex.test(upiId)) {
      setError('Please enter a valid UPI ID (e.g., yourname@upi)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Create consultant registration order
      const response = await paymentsAPI.createConsultantRegistrationOrder({
        upi_id: upiId,
      });

      const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        toast.error('Razorpay configuration missing');
        return;
      }

      // Open Razorpay checkout for ₹1
      await openCheckout({
        key_id: razorpayKey,
        order_id: response.order_id,
        amount: 100, // ₹1 = 100 paise
        currency: 'INR',
        customer_email: formData.email,
        notes: {
          upi_id: upiId,
          profession_type: formData.profession_type,
        },
        prefill: {
          name: `${formData.first_name} ${formData.last_name}`,
          email: formData.email,
        },
        onSuccess: async (paymentData) => {
          try {
            // Verify payment
            await paymentsAPI.verifyPayment({
              razorpay_order_id: paymentData.razorpay_order_id,
              razorpay_payment_id: paymentData.razorpay_payment_id,
              razorpay_signature: paymentData.razorpay_signature,
            });

            setRegistrationComplete(true);
            toast.success('Registration fee paid! Welcome to CounselMate!');
            
            // Redirect to profile creation after successful payment
            setTimeout(() => {
              router.push('/profile/professional/create');
            }, 2000);
          } catch (error) {
            console.error('Payment verification failed:', error);
            toast.error('Payment verification failed. Please contact support.');
            setError('Payment verification failed. Please try again or contact support.');
          }
        },
        onError: (error) => {
          console.error('Payment error:', error);
          toast.error('Payment failed. Please try again.');
          setError('Payment failed. Please try again.');
        },
      });
    } catch (error) {
      console.error('Error creating payment order:', error);
      toast.error('Failed to process payment. Please try again.');
      setError('Failed to process payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Back to home link */}
      <div className="absolute top-4 left-4">
        <Link href="/" className="text-slate-600 hover:text-slate-900 text-sm font-medium">
          ← Back to Consultancy
        </Link>
      </div>

      {/* Main container */}
      <div className="flex items-center justify-center min-h-screen px-4 py-8">
        <div className="w-full max-w-2xl">
          {step === 'profession' && (
            <div>
              <h1 className="text-4xl font-serif font-bold text-slate-900 mb-3">
                Join as a Professional
              </h1>
              <p className="text-lg text-slate-600 mb-10">
                Select your profession to get started. We verify all credentials.
              </p>

              <div className="grid grid-cols-1 gap-4">
                {professions.map((prof) => (
                  <button
                    key={prof.id}
                    onClick={() => handleSelectProfession(prof.id)}
                    className={`relative p-6 rounded-lg border-2 transition-all text-left ${
                      profession === prof.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-3xl">{prof.icon}</span>
                          <h3 className="text-xl font-bold text-slate-900">
                            {prof.title}
                          </h3>
                        </div>
                        <p className="text-slate-600">{prof.description}</p>
                      </div>
                      <ChevronRight className="w-6 h-6 text-blue-500 flex-shrink-0 ml-4" />
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-10 text-center text-slate-600">
                <p className="text-sm">
                  Looking to find professionals?{' '}
                  <Link
                    href="/auth/register?role=APPRENTICE"
                    className="font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Register as a Client
                  </Link>
                </p>
              </div>
            </div>
          )}

          {step === 'details' && (
            <div>
              <button
                onClick={handleBackToProfession}
                className="text-slate-600 hover:text-slate-900 text-sm font-medium mb-6"
              >
                ← Back
              </button>

              <h1 className="text-4xl font-serif font-bold text-slate-900 mb-3">
                Create Your Account
              </h1>
              <p className="text-lg text-slate-600 mb-8">
                Register as a {formData.profession_type === 'CA' ? 'Chartered Accountant' : formData.profession_type === 'LAWYER' ? 'Lawyer' : 'Consultant'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="first_name" className="text-sm font-medium text-slate-700">
                      First Name
                    </Label>
                    <Input
                      id="first_name"
                      type="text"
                      placeholder="John"
                      value={formData.first_name}
                      onChange={(e) => {
                        setFormData({ ...formData, first_name: e.target.value });
                        setError('');
                      }}
                      disabled={loading}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="last_name" className="text-sm font-medium text-slate-700">
                      Last Name
                    </Label>
                    <Input
                      id="last_name"
                      type="text"
                      placeholder="Doe"
                      value={formData.last_name}
                      onChange={(e) => {
                        setFormData({ ...formData, last_name: e.target.value });
                        setError('');
                      }}
                      disabled={loading}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      setError('');
                    }}
                    disabled={loading}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => {
                      setFormData({ ...formData, password: e.target.value });
                      setError('');
                    }}
                    disabled={loading}
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Minimum 8 characters
                  </p>
                </div>

                <div>
                  <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
                    Confirm Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => {
                      setFormData({ ...formData, confirmPassword: e.target.value });
                      setError('');
                    }}
                    disabled={loading}
                    className="mt-1"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>

                {/* Divider */}
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-300" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-600">
                      Or continue with
                    </span>
                  </div>
                </div>

                {/* Google Signup Button */}
                <Button
                  type="button"
                  onClick={handleGoogleSignup}
                  disabled={loading}
                  variant="outline"
                  className="w-full h-11 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting to Google...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5 mr-2"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Sign up with Google
                    </>
                  )}
                </Button>

                <p className="text-center text-sm text-slate-600">
                  Already have an account?{' '}
                  <Link
                    href="/auth/login"
                    className="font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Sign in
                  </Link>
                </p>
              </form>
            </div>
          )}

          {step === 'payment' && (
            <div>
              <button
                onClick={() => setStep('details')}
                className="text-slate-600 hover:text-slate-900 text-sm font-medium mb-6"
              >
                ← Back
              </button>

              <h1 className="text-4xl font-serif font-bold text-slate-900 mb-3">
                Complete Registration
              </h1>
              <p className="text-lg text-slate-600 mb-8">
                Pay ₹1 registration fee and provide your UPI ID for future payouts
              </p>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3 mb-6">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="space-y-6">
                {/* UPI ID Input */}
                <div>
                  <Label htmlFor="upi_id" className="text-sm font-medium text-slate-700">
                    UPI ID for Payouts
                  </Label>
                  <Input
                    id="upi_id"
                    type="text"
                    placeholder="yourname@upi"
                    value={upiId}
                    onChange={(e) => {
                      setUpiId(e.target.value);
                      setError('');
                    }}
                    disabled={loading || registrationComplete}
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Format: yourname@upi (e.g., john@okhdfcbank)
                  </p>
                </div>

                {/* Payment Summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-900">
                      <p className="font-semibold mb-1">Registration Fee: ₹1</p>
                      <ul className="space-y-1 text-xs">
                        <li>• One-time fee for consultant registration</li>
                        <li>• Access to client network and bookings</li>
                        <li>• Service listing on platform</li>
                        <li>• 95% payout for each consultation</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="border border-slate-300 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-900 mb-3">Payment Method</h3>
                  <div className="flex items-center gap-2 p-3 border border-blue-400 rounded-lg bg-blue-50">
                    <input
                      type="radio"
                      id="razorpay"
                      name="payment"
                      checked
                      readOnly
                      className="w-4 h-4"
                    />
                    <label htmlFor="razorpay" className="flex-1 text-sm font-semibold cursor-pointer">
                      Razorpay (All payment methods: Card, UPI, Net Banking, Wallet)
                    </label>
                  </div>
                </div>

                {/* Security Info */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2 text-sm">
                  <span className="text-green-600 font-semibold">✓</span>
                  <span className="text-green-800">Your payment is secure and encrypted with Razorpay</span>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    type="button"
                    onClick={() => setStep('details')}
                    disabled={loading || registrationComplete}
                    variant="outline"
                    className="flex-1 h-11 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50"
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePayment}
                    disabled={loading || registrationComplete}
                    className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : registrationComplete ? (
                      <>
                        <span className="text-green-300 mr-2">✓</span>
                        Payment Complete
                      </>
                    ) : (
                      'Pay ₹1'
                    )}
                  </Button>
                </div>

                <p className="text-center text-xs text-slate-600">
                  By proceeding, you agree to our{' '}
                  <Link
                    href="/terms"
                    className="font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Terms of Service
                  </Link>
                  {' '}and{' '}
                  <Link
                    href="/privacy"
                    className="font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
