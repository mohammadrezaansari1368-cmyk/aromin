import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { MODE, auth, bootstrap } from './store.js';
import Login from './pages/Registration.jsx';
import Employee from './pages/EmployeeTelegram.jsx';
import AdvancedShifts from './pages/AdvancedShifts.jsx';
import AppLayout from './layout/AppLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { WorkplaceList, WorkplaceForm } from './pages/Workplaces.jsx';
import { ShiftList, ShiftForm } from './pages/Shifts.jsx';
import { PersonnelList, PersonnelForm } from './pages/Personnel.jsx';
import { PerformanceReport, AuditReport, VacationReport, VacationDetails, ProjectReport, TrackingReport, IncompleteReport } from './pages/Reports.jsx';
import { Requests, RequestSettings } from './pages/Requests.jsx';
import { Holidays, PolicyList, PolicyForm, GroupList, GroupForm, ProjectList, ProjectForm, SmsPanel, WebService } from './pages/Settings.jsx';
import { Devices } from './pages/Devices.jsx';
import { DeviceRecords } from './pages/DeviceRecords.jsx';
import { Messages, Tickets, NewTicket, Packages, Application } from './pages/Misc.jsx';

export default function App() {
  // حالت سرور: تا ورود مدیر و بارگذاری داده‌ها، پنل نمایش داده نمی‌شود
  const [state, setState] = useState('login');
  useEffect(() => {
    if (state === 'loading') bootstrap().then(() => setState('ready')).catch(() => setState('login'));
    const out = () => setState('login');
    window.addEventListener('aromin:logout', out);
    return () => window.removeEventListener('aromin:logout', out);
  }, [state]);
  if (state === 'login') return <Login onDone={() => setState('ready')} />;
  if (state === 'loading') return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>;
  if (auth.business?.role === 'employee') return <Employee />;
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/workplaces" element={<WorkplaceList />} />
        <Route path="/workplaces/new" element={<WorkplaceForm />} />
        <Route path="/workplaces/edit/:id" element={<WorkplaceForm />} />
        <Route path="/shifts" element={<ShiftList />} />
        <Route path="/shifts/advanced" element={<AdvancedShifts />} />
        <Route path="/shifts/advanced/:id" element={<AdvancedShifts />} />
        <Route path="/shifts/create" element={<ShiftForm />} />
        <Route path="/shifts/edit/:id" element={<ShiftForm />} />
        <Route path="/personnel" element={<PersonnelList />} />
        <Route path="/personnel/new" element={<PersonnelForm />} />
        <Route path="/personnel/edit/:id" element={<PersonnelForm />} />
        <Route path="/performance" element={<PerformanceReport />} />
        <Route path="/performance-audit" element={<AuditReport />} />
        <Route path="/vacation-report" element={<VacationReport />} />
        <Route path="/vacation-details" element={<VacationDetails />} />
        <Route path="/project/report" element={<ProjectReport />} />
        <Route path="/tracking-report" element={<TrackingReport />} />
        <Route path="/incomplete-entrance-report" element={<IncompleteReport />} />
        <Route path="/requests/new" element={<Requests />} />
        <Route path="/requests/settings" element={<RequestSettings />} />
        <Route path="/holidays" element={<Holidays />} />
        <Route path="/policies" element={<PolicyList />} />
        <Route path="/policies/new" element={<PolicyForm />} />
        <Route path="/policies/edit/:id" element={<PolicyForm />} />
        <Route path="/groups" element={<GroupList />} />
        <Route path="/groups/add" element={<GroupForm />} />
        <Route path="/groups/edit/:id" element={<GroupForm />} />
        <Route path="/project/list" element={<ProjectList />} />
        <Route path="/project/add" element={<ProjectForm />} />
        <Route path="/project/edit/:id" element={<ProjectForm />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/device-records" element={<DeviceRecords />} />
        <Route path="/sms-panel" element={<SmsPanel />} />
        <Route path="/web-service" element={<WebService />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/tickets/new" element={<NewTicket />} />
        <Route path="/packages" element={<Packages />} />
        <Route path="/application" element={<Application />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
