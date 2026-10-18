-- Ported from supabase/migrations 001 + 003 + 006, minus everything
-- Supabase-specific (auth schema, RLS, handle_new_user, unused RPCs).

-- updated_at maintenance (same behaviour as the Supabase schema)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint
CREATE TRIGGER update_pricing_config_updated_at BEFORE UPDATE ON pricing_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint
CREATE TRIGGER update_promo_codes_updated_at BEFORE UPDATE ON promo_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint
CREATE TRIGGER update_modules_updated_at BEFORE UPDATE ON modules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint
CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON lessons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint
CREATE TRIGGER update_user_progress_updated_at BEFORE UPDATE ON user_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint
CREATE TRIGGER update_testimonials_updated_at BEFORE UPDATE ON testimonials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint
CREATE TRIGGER update_faq_items_updated_at BEFORE UPDATE ON faq_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
--> statement-breakpoint

-- The one live RPC from the Supabase schema (promo usage counter)
CREATE OR REPLACE FUNCTION increment_promo_code_usage(code_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE promo_codes
    SET current_uses = current_uses + 1
    WHERE id = code_id;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Default rows (from 001 and 006); data migration upserts over these
INSERT INTO pricing_config (name, base_price, currency, is_active)
VALUES ('Lifetime Access', 14900, 'gbp', true)
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO site_settings (key, value) VALUES ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;
