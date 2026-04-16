/**
 * Type definitions matching the Go backend models
 */

export type Role = 'APPRENTICE' | 'PROFESSIONAL' | 'ADMIN';
export type AuthProvider = 'LOCAL' | 'GOOGLE';
export type ProfessionType = 
  | 'POWER_OF_ATTORNEY'
  | 'MARRIAGE_REGISTRATION'
  | 'LEGAL_HEIR_CERTIFICATE';
export type PlanType = 'FREE' | 'PREMIUM';
export type Availability = 'AVAILABLE' | 'NOT_AVAILABLE' | 'PART_TIME';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
  is_verified: boolean;
  auth_provider: AuthProvider;
  profile_picture?: string;
  email_verified_at?: string;
  last_login_at?: string;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  profession_type: ProfessionType;
  title: string;
  bio: string;
  skills: string[];
  location: string;
  city: string;
  state: string;
  experience_years: number;
  availability: string;
  is_verified: boolean;
  profile_picture: string;
  linkedin_url: string;
  website_url: string;
  certifications: string[];
  languages: string[];
  hourly_rate?: number;
  rating: number;
  review_count: number;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: PlanType;
  is_active: boolean;
  start_date: string;
  end_date?: string;
  ai_queries_used: number;
  ai_queries_limit: number;
  contacts_used: number;
  contacts_limit: number;
  profile_boost: boolean;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}

// For login endpoint which nests tokens
export interface LoginAuthResponse {
  message: string;
  user: User;
  tokens: {
    access_token: string;
    refresh_token: string;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterVerificationResponse {
  message: string;
  user: User;
  verification_required: true;
  email: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: Role;
}

export interface ProfileSearchParams {
  query?: string;
  profession?: ProfessionType;
  skills?: string[];
  location?: string;
  city?: string;
  state?: string;
  availability?: string;
  min_experience?: number;
  max_experience?: number;
  min_rate?: number;
  max_rate?: number;
  verified?: boolean;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface SearchResponse {
  profiles: Profile[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface TagsResponse {
  ca_skills: string[];
  lawyer_skills: string[];
  common_skills: string[];
  locations: string[];
  states: string[];
  availability: string[];
  professions: string[];
}

export interface UsageStats {
  ai_queries_used: number;
  ai_queries_limit: number;
  contacts_used: number;
  contacts_limit: number;
  ai_queries_remaining: number;
  contacts_remaining: number;
  reset_date: string;
}

export interface UpdateProfileRequest {
  profession_type?: ProfessionType;
  title?: string;
  bio?: string;
  skills?: string[];
  location?: string;
  city?: string;
  state?: string;
  experience_years?: number;
  availability?: string;
  profile_picture?: string;
  linkedin_url?: string;
  website_url?: string;
  certifications?: string[];
  languages?: string[];
  hourly_rate?: number;
}

export interface UpdateUserRequest {
  first_name?: string;
  last_name?: string;
  profile_picture?: string;
  role?: Role;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ContactProfileRequest {
  message: string;
  subject: string;
}

export interface AITagSuggestionRequest {
  text: string;
  profession_type: ProfessionType;
}

export interface AITagSuggestionResponse {
  suggested_tags: string[];
}

export interface VerificationDocument {
  id: string;
  user_id: string;
  document_type: string;
  file_url: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason?: string;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

export interface AdminReviewData {
  status: 'APPROVED' | 'REJECTED';
  rejection_reason?: string;
}

// Services
export interface Service {
  id: string;
  name: string;
  description: string;
  base_price: number;
  category: string;
  is_active: boolean;
  created_at: string;
}

export interface ServicesResponse {
  services: Service[];
}

// Payments
export interface PaymentOrder {
  id: string;
  order_id: string;
  user_id: string;
  service_id?: string;
  amount: number;
  currency: string;
  status: 'created' | 'paid' | 'failed' | 'cancelled';
  payment_method?: string;
  created_at: string;
}

export interface PaymentSplit {
  platform_fee: number;
  consultant_payout: number;
}

export interface CreatePaymentOrderRequest {
  service_id: string;
  consultant_id?: string;
  amount: number;
  notes?: string;
}

export interface CreateConsultantRegistrationRequest {
  upi_id: string;
}

export interface ConsultantRegistrationResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

export interface PaymentVerificationRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface WebhookPayload {
  event: string;
  created_at: number;
  data: {
    payment: {
      id: string;
      entity: string;
      amount: number;
      currency: string;
      status: string;
      order_id: string;
      invoice_id?: string;
      international: boolean;
      method: string;
      description?: string;
      notes?: Record<string, string>;
    };
  };
}

