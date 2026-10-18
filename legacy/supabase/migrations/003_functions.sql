-- =============================================
-- Database Functions
-- =============================================

-- Function to increment promo code usage
CREATE OR REPLACE FUNCTION public.increment_promo_code_usage(code_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.promo_codes
    SET current_uses = current_uses + 1
    WHERE id = code_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get module progress for a user
CREATE OR REPLACE FUNCTION public.get_module_progress(p_user_id UUID, p_module_id UUID)
RETURNS TABLE (
    total_lessons BIGINT,
    completed_lessons BIGINT,
    progress_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(l.id) as total_lessons,
        COUNT(up.id) FILTER (WHERE up.completed = true) as completed_lessons,
        ROUND(
            (COUNT(up.id) FILTER (WHERE up.completed = true)::NUMERIC / 
             NULLIF(COUNT(l.id), 0)::NUMERIC) * 100, 
            2
        ) as progress_percentage
    FROM public.lessons l
    LEFT JOIN public.user_progress up 
        ON l.id = up.lesson_id AND up.user_id = p_user_id
    WHERE l.module_id = p_module_id AND l.is_published = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get overall course progress for a user
CREATE OR REPLACE FUNCTION public.get_overall_progress(p_user_id UUID)
RETURNS TABLE (
    total_modules BIGINT,
    completed_modules BIGINT,
    total_lessons BIGINT,
    completed_lessons BIGINT,
    progress_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH lesson_stats AS (
        SELECT 
            l.module_id,
            COUNT(l.id) as total,
            COUNT(up.id) FILTER (WHERE up.completed = true) as completed
        FROM public.lessons l
        LEFT JOIN public.user_progress up 
            ON l.id = up.lesson_id AND up.user_id = p_user_id
        WHERE l.is_published = true
        GROUP BY l.module_id
    )
    SELECT 
        (SELECT COUNT(*) FROM public.modules WHERE is_published = true) as total_modules,
        COUNT(*) FILTER (WHERE ls.total = ls.completed AND ls.total > 0) as completed_modules,
        SUM(ls.total) as total_lessons,
        SUM(ls.completed) as completed_lessons,
        ROUND(
            (SUM(ls.completed)::NUMERIC / NULLIF(SUM(ls.total), 0)::NUMERIC) * 100,
            2
        ) as progress_percentage
    FROM lesson_stats ls;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark a lesson as completed
CREATE OR REPLACE FUNCTION public.mark_lesson_completed(p_user_id UUID, p_lesson_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.user_progress (user_id, lesson_id, completed, completed_at)
    VALUES (p_user_id, p_lesson_id, true, NOW())
    ON CONFLICT (user_id, lesson_id)
    DO UPDATE SET completed = true, completed_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update video progress position
CREATE OR REPLACE FUNCTION public.update_video_position(
    p_user_id UUID, 
    p_lesson_id UUID, 
    p_position_seconds INTEGER
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.user_progress (user_id, lesson_id, last_position_seconds)
    VALUES (p_user_id, p_lesson_id, p_position_seconds)
    ON CONFLICT (user_id, lesson_id)
    DO UPDATE SET last_position_seconds = p_position_seconds;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
