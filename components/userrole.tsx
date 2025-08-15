import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface UserRoleContextType {
  role: string | null;
  loading: boolean;
}

const UserRoleContext = createContext<UserRoleContextType>({ role: null, loading: true });

export const useUserRole = () => useContext(UserRoleContext);

interface UserRoleProviderProps {
  children: ReactNode;
}

export const UserRoleProvider = ({ children }: UserRoleProviderProps) => {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchRole = async () => {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        router.replace('/login');
        setLoading(false);
        return;
      }
      // Fetch role from public.user table using user's id or email
      // Try by id first, fallback to email if needed
      let { data, error } = await supabase
        .from('user')
        .select('role')
        .eq('id', user.id)
        .single();
      if (error || !data) {
        // fallback: try by email if id fails (for legacy)
        if (user.email) {
          const { data: emailData, error: emailError } = await supabase
            .from('user')
            .select('role')
            .eq('email', user.email)
            .single();
          if (emailData && emailData.role) {
            setRole(emailData.role);
            setLoading(false);
            return;
          }
        }
        setRole(null);
        setLoading(false);
        return;
      }
      setRole(data.role);
      setLoading(false);
    };
    fetchRole();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
        <span className="ml-4 text-blue-700 font-semibold">Loading...</span>
      </div>
    );
  }

  return (
    <UserRoleContext.Provider value={{ role, loading }}>
      {children}
    </UserRoleContext.Provider>
  );
};
