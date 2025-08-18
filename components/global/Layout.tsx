'use client'

import React from 'react'
import Sidebar from './Sidebar'
import { UserRoleProvider } from '../userrole';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useUserRole } from '../userrole';

interface LayoutProps {
  children: React.ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <UserRoleProvider>
      <RestrictedLayout>{children}</RestrictedLayout>
    </UserRoleProvider>
  );
}

function RestrictedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, loading } = useUserRole();

  useEffect(() => {
    if (loading) return;
    if (role === 'opd-ipd') {
      // Restrict /dashboard and /admin/*
      if (
        pathname === '/dashboard' ||
        pathname.startsWith('/admin/') ||
        pathname === '/admin' // just in case
      ) {
        router.replace('/opd/appointment');
      }
    }
  }, [role, loading, pathname, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30">
      <Sidebar />
      <div className="lg:ml-72">
        <main className="p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default Layout