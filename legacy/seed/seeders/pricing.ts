/**
 * Pricing Seeder
 */

import { db, schema } from '../lib/client.js';
import { loadJson, logSuccess, logError } from '../lib/utils.js';

interface PricingData {
  pricing_config: {
    name: string;
    base_price: number;
    currency: string;
    is_active: boolean;
  };
  promo_codes: Array<{
    code: string;
    description?: string;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    max_uses?: number;
    valid_from: string;
    valid_until?: string;
    is_active: boolean;
  }>;
}

export async function seedPricing(): Promise<void> {
  console.log('Seeding pricing and promo codes...');
  const pricingData = loadJson<PricingData>('pricing.json');

  // Update or insert pricing config
  try {
    await db
      .insert(schema.pricing_config)
      .values(pricingData.pricing_config)
      .onConflictDoUpdate({
        target: schema.pricing_config.name,
        set: pricingData.pricing_config
      });
    logSuccess(
      `Pricing: ${pricingData.pricing_config.name} (£${pricingData.pricing_config.base_price / 100})`
    );
  } catch (error) {
    logError(`Error seeding pricing config: ${(error as Error).message}`);
  }

  // Seed promo codes
  for (const promoCode of pricingData.promo_codes) {
    try {
      await db
        .insert(schema.promo_codes)
        .values(promoCode)
        .onConflictDoUpdate({ target: schema.promo_codes.code, set: promoCode });
      const discount =
        promoCode.discount_type === 'percentage'
          ? `${promoCode.discount_value}%`
          : `£${promoCode.discount_value / 100}`;
      logSuccess(`Promo: ${promoCode.code} (${discount} off)`);
    } catch (error) {
      logError(`Error seeding promo code "${promoCode.code}": ${(error as Error).message}`);
    }
  }
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedPricing()
    .then(() => {
      console.log('\n✅ Pricing seeded!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}
