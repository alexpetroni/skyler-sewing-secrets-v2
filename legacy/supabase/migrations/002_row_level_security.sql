-- =============================================
-- Row Level Security Policies
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_admin = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if current user is a member
CREATE OR REPLACE FUNCTION public.is_member()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_member = true AND is_suspended = false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- PROFILES POLICIES
-- =============================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id AND
        -- Prevent users from modifying these fields
        is_member = (SELECT is_member FROM public.profiles WHERE id = auth.uid()) AND
        is_admin = (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) AND
        is_suspended = (SELECT is_suspended FROM public.profiles WHERE id = auth.uid())
    );

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (public.is_admin());

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles" ON public.profiles
    FOR UPDATE USING (public.is_admin());

-- =============================================
-- PRICING CONFIG POLICIES
-- =============================================

-- Anyone can view active pricing
CREATE POLICY "Anyone can view active pricing" ON public.pricing_config
    FOR SELECT USING (is_active = true);

-- Admins can manage pricing
CREATE POLICY "Admins can manage pricing" ON public.pricing_config
    FOR ALL USING (public.is_admin());

-- =============================================
-- PROMO CODES POLICIES
-- =============================================

-- Anyone can view active valid promo codes (for validation)
CREATE POLICY "Anyone can view active promo codes" ON public.promo_codes
    FOR SELECT USING (
        is_active = true AND
        valid_from <= NOW() AND
        (valid_until IS NULL OR valid_until > NOW()) AND
        (max_uses IS NULL OR current_uses < max_uses)
    );

-- Admins can manage promo codes
CREATE POLICY "Admins can manage promo codes" ON public.promo_codes
    FOR ALL USING (public.is_admin());

-- =============================================
-- MODULES POLICIES
-- =============================================

-- Anyone can view published modules
CREATE POLICY "Anyone can view published modules" ON public.modules
    FOR SELECT USING (is_published = true);

-- Admins can view all modules
CREATE POLICY "Admins can view all modules" ON public.modules
    FOR SELECT USING (public.is_admin());

-- Admins can manage modules
CREATE POLICY "Admins can manage modules" ON public.modules
    FOR ALL USING (public.is_admin());

-- =============================================
-- LESSONS POLICIES
-- =============================================

-- Anyone can view published lessons metadata
CREATE POLICY "Anyone can view published lessons" ON public.lessons
    FOR SELECT USING (is_published = true);

-- Admins can view all lessons
CREATE POLICY "Admins can view all lessons" ON public.lessons
    FOR SELECT USING (public.is_admin());

-- Admins can manage lessons
CREATE POLICY "Admins can manage lessons" ON public.lessons
    FOR ALL USING (public.is_admin());

-- =============================================
-- LESSON RESOURCES POLICIES
-- =============================================

-- Members can view resources for published lessons
CREATE POLICY "Members can view lesson resources" ON public.lesson_resources
    FOR SELECT USING (
        public.is_member() AND
        EXISTS (
            SELECT 1 FROM public.lessons 
            WHERE id = lesson_id AND is_published = true
        )
    );

-- Admins can manage resources
CREATE POLICY "Admins can manage lesson resources" ON public.lesson_resources
    FOR ALL USING (public.is_admin());

-- =============================================
-- USER PROGRESS POLICIES
-- =============================================

-- Users can view their own progress
CREATE POLICY "Users can view own progress" ON public.user_progress
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own progress
CREATE POLICY "Users can insert own progress" ON public.user_progress
    FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_member());

-- Users can update their own progress
CREATE POLICY "Users can update own progress" ON public.user_progress
    FOR UPDATE USING (auth.uid() = user_id);

-- Admins can view all progress
CREATE POLICY "Admins can view all progress" ON public.user_progress
    FOR SELECT USING (public.is_admin());

-- =============================================
-- BLOG POSTS POLICIES
-- =============================================

-- Anyone can view published posts
CREATE POLICY "Anyone can view published posts" ON public.blog_posts
    FOR SELECT USING (is_published = true);

-- Admins can view all posts
CREATE POLICY "Admins can view all posts" ON public.blog_posts
    FOR SELECT USING (public.is_admin());

-- Admins can manage posts
CREATE POLICY "Admins can manage blog posts" ON public.blog_posts
    FOR ALL USING (public.is_admin());

-- =============================================
-- TESTIMONIALS POLICIES
-- =============================================

-- Anyone can view published testimonials
CREATE POLICY "Anyone can view published testimonials" ON public.testimonials
    FOR SELECT USING (is_published = true);

-- Admins can view all testimonials
CREATE POLICY "Admins can view all testimonials" ON public.testimonials
    FOR SELECT USING (public.is_admin());

-- Admins can manage testimonials
CREATE POLICY "Admins can manage testimonials" ON public.testimonials
    FOR ALL USING (public.is_admin());

-- =============================================
-- FAQ POLICIES
-- =============================================

-- Anyone can view published FAQ
CREATE POLICY "Anyone can view published faq" ON public.faq_items
    FOR SELECT USING (is_published = true);

-- Admins can view all FAQ
CREATE POLICY "Admins can view all faq" ON public.faq_items
    FOR SELECT USING (public.is_admin());

-- Admins can manage FAQ
CREATE POLICY "Admins can manage faq" ON public.faq_items
    FOR ALL USING (public.is_admin());

-- =============================================
-- CONTACT SUBMISSIONS POLICIES
-- =============================================

-- Anyone can submit contact form
CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions
    FOR INSERT WITH CHECK (true);

-- Admins can view and manage submissions
CREATE POLICY "Admins can manage contact submissions" ON public.contact_submissions
    FOR ALL USING (public.is_admin());

-- =============================================
-- NEWSLETTER POLICIES
-- =============================================

-- Anyone can subscribe
CREATE POLICY "Anyone can subscribe to newsletter" ON public.newsletter_subscribers
    FOR INSERT WITH CHECK (true);

-- Subscribers can unsubscribe (update their own record)
CREATE POLICY "Subscribers can unsubscribe" ON public.newsletter_subscribers
    FOR UPDATE USING (email = current_setting('request.jwt.claims', true)::json->>'email');

-- Admins can manage subscribers
CREATE POLICY "Admins can manage newsletter" ON public.newsletter_subscribers
    FOR ALL USING (public.is_admin());

-- =============================================
-- PAYMENTS POLICIES
-- =============================================

-- Users can view their own payments
CREATE POLICY "Users can view own payments" ON public.payments
    FOR SELECT USING (auth.uid() = user_id);

-- Admins can view all payments
CREATE POLICY "Admins can view all payments" ON public.payments
    FOR SELECT USING (public.is_admin());

-- Only service role can insert/update payments (via webhook)
-- This is handled at the application level with admin client
