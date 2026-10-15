import { Button, Empty, Input, Popconfirm, Select, Space, Table, Tag, App } from 'antd';
import { DeleteOutlined, EditOutlined, DownloadOutlined } from '@ant-design/icons';
import { useCollection, today } from '../store.js';

export const Page = ({ title, extra, children }) => (
  <div className="page-card">
    <div className="page-title" style={{ position: 'relative' }}>
      {title}
      {extra && <div style={{ position: 'absolute', left: 0, top: 0 }}>{extra}</div>}
    </div>
    {children}
  </div>
);

export const empty = { emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="داده‌ای موجود نیست" /> };

export const DataTable = (props) => (
  <Table size="middle" rowKey="id" locale={empty} scroll={{ x: 'max-content' }} pagination={{ pageSize: 10, hideOnSinglePage: true }} {...props} />
);

export const StatusTag = ({ v }) => {
  const c = { 'فعال': 'green', 'غیر فعال': 'default', 'تایید شده': 'green', 'رد شده': 'red', 'در دست بررسی': 'gold', 'باز': 'blue', 'بسته': 'default', 'پاسخ داده شده': 'purple' }[v];
  return <Tag color={c}>{v}</Tag>;
};

export function RowActions({ onEdit, onDelete }) {
  return (
    <Space>
      {onEdit && <Button size="small" type="text" icon={<EditOutlined />} onClick={onEdit} />}
      {onDelete && (
        <Popconfirm title="حذف شود؟" okText="بله" cancelText="خیر" onConfirm={onDelete}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )}
    </Space>
  );
}

// تاریخ شمسی به‌صورت متن YYYY/MM/DD
export const DateInput = (props) => (
  <Input placeholder="انتخاب تاریخ (مثلاً ۱۴۰۵/۰۷/۱۷)" style={{ direction: 'ltr', textAlign: 'right' }} {...props} />
);
export const dateRule = { pattern: /^1[34]\d\d\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])$/, message: 'فرمت تاریخ: ۱۴۰۵/۰۷/۱۷' };
export const defaultDate = today;

export function PersonSelect(props) {
  const people = useCollection('personnel');
  return (
    <Select allowClear showSearch optionFilterProp="label" placeholder="تمام پرسنل" style={{ minWidth: 180 }}
      options={people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName} (${p.code})` }))} {...props} />
  );
}
export function CollectionSelect({ name, labelKey = 'name', ...props }) {
  const rows = useCollection(name);
  return <Select allowClear showSearch optionFilterProp="label" style={{ minWidth: 160 }} options={rows.map((r) => ({ value: r.id, label: r[labelKey] }))} {...props} />;
}

export const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const YEARS = [1403, 1404, 1405, 1406];
export const WEEKDAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

// خروجی اکسل (CSV با BOM برای نمایش درست فارسی در Excel)
export function ExcelButton({ rows, columns, file = 'export', label = 'دانلود اکسل' }) {
  const { message } = App.useApp();
  const run = () => {
    const cols = columns.filter((c) => c.dataIndex && c.title);
    if (!rows.length) { message.info('داده‌ای برای خروجی وجود ندارد'); return; }
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map((c) => esc(c.title)).join(','), ...rows.map((r) => cols.map((c) => esc(c.exportValue ? c.exportValue(r) : r[c.dataIndex])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${file}.csv`; a.click();
  };
  return <Button icon={<DownloadOutlined />} onClick={run}>{label}</Button>;
}

export const Field = ({ label, children, w = 180 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: w }}>
    <span style={{ fontSize: 12, color: 'rgba(255,255,255,.65)' }}>{label}</span>
    {children}
  </div>
);
