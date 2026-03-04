import React from 'react';
import { Sidebar } from './Sidebar';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{display: 'flex', minHeight: '100vh', background: '#F3F4F6'}}>
      <Sidebar />
      <main style={{flex: 1, padding: '28px 32px', overflowY: 'auto', height: '100vh'}}>
        {children}
      </main>
    </div>
  );
};
