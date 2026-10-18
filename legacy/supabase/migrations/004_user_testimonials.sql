-- =============================================
-- Add user_id to testimonials for member reviews
-- =============================================

-- Add user_id column to link testimonials to users
ALTER TABLE public.testimonials
ADD COLUMN user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add index for user lookups
CREATE INDEX idx_testimonials_user ON public.testimonials(user_id);

-- =============================================
-- Update RLS Policies for member reviews
-- =============================================

-- Members can submit their own testimonials (pending moderation)
CREATE POLICY "Members can submit testimonials" ON public.testimonials
    FOR INSERT WITH CHECK (
        public.is_member() AND
        auth.uid() = user_id AND
        is_published = false  -- New testimonials start unpublished
    );

-- Users can view their own testimonials (even unpublished)
CREATE POLICY "Users can view own testimonials" ON public.testimonials
    FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own unpublished testimonials
CREATE POLICY "Users can update own unpublished testimonials" ON public.testimonials
    FOR UPDATE USING (
        auth.uid() = user_id AND
        is_published = false
    )
    WITH CHECK (
        auth.uid() = user_id AND
        is_published = false  -- Can't self-publish
    );

-- Users can delete their own unpublished testimonials
CREATE POLICY "Users can delete own unpublished testimonials" ON public.testimonials
    FOR DELETE USING (
        auth.uid() = user_id AND
        is_published = false
    );
