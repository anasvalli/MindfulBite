import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from './AuthContext';

export type SubscriptionTier = 'Basic' | 'Premium';

type PurchasesContextType = {
  isSubscribed: boolean;
  tier: SubscriptionTier;
  refreshSubscription: () => Promise<void>;
  setTierManually: (tier: SubscriptionTier) => Promise<void>;
};

const PurchasesContext = createContext<PurchasesContextType>({
  isSubscribed: false,
  tier: 'Basic',
  refreshSubscription: async () => {},
  setTierManually: async () => {},
});

export function usePurchases() {
  return useContext(PurchasesContext);
}

export function PurchasesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>('Basic');

  useEffect(() => {
    if (user) refreshSubscription();
  }, [user]);

  async function refreshSubscription() {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('users')
        .select('subscription_tier')
        .eq('id', user.id)
        .single();

      if (data?.subscription_tier) {
        setTier(data.subscription_tier as SubscriptionTier);
      } else {
        setTier('Basic');
      }
    } catch (e) {
      console.log('Subscription check failed:', e);
      setTier('Basic');
    }
  }

  // Called after user completes payment — saves to Supabase
  async function setTierManually(newTier: SubscriptionTier) {
    if (!user) return;
    setTier(newTier);
    await supabase
      .from('users')
      .update({ subscription_tier: newTier })
      .eq('id', user.id);
  }

  const isSubscribed = tier !== 'Basic';

  return (
    <PurchasesContext.Provider value={{ isSubscribed, tier, refreshSubscription, setTierManually }}>
      {children}
    </PurchasesContext.Provider>
  );
}
