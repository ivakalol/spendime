import { BarChart3, CalendarClock, CircleDollarSign, Landmark, LayoutDashboard, Plus, ReceiptText, Shapes, WalletCards } from 'lucide-react';
import { useId, useState } from 'react';
import type { Guide } from '../../shared/publicSite';

export type PreviewKind = Guide['preview'];
const nav = [['Home', LayoutDashboard], ['Transactions', ReceiptText], ['Accounts', WalletCards], ['Assets', BarChart3], ['Debts & loans', Landmark], ['Regular payments', CalendarClock], ['Categories', Shapes]] as const;
const transactions = [
  { title: 'Weekly groceries', category: 'Food', amount: '−€64.80', icon: '↗', tone: 'rose' },
  { title: 'Salary', category: 'Income', amount: '+€3,200.00', icon: '↙', tone: 'green' },
  { title: 'Coffee with a friend', category: 'Lifestyle', amount: '−€8.50', icon: '↗', tone: 'orange' },
  { title: 'To savings', category: 'Transfer', amount: '↔ €400.00', icon: '⇄', tone: 'blue' },
];

function Trend({ compact = false }: { compact?: boolean }) {
  const id = useId().replaceAll(':', '');
  return <div className="sp-demo-chart" role="img" aria-label="Illustrative spending trend, fictional amounts over a month">
    <svg viewBox="0 0 440 140" aria-hidden="true"><defs><linearGradient id={`fill${id}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d98562" stopOpacity=".3" /><stop offset="1" stopColor="#d98562" stopOpacity="0" /></linearGradient></defs>
      {[20, 60, 100].map(y => <line key={y} x1="0" x2="440" y1={y} y2={y} stroke="#e7e9e2" strokeDasharray="3 4" />)}
      <path d="M0 112 L24 105 42 110 62 75 82 96 104 88 126 98 148 46 170 79 192 70 214 87 236 53 258 61 280 32 302 48 324 52 346 16 368 39 390 29 412 47 440 20 V140 H0Z" fill={`url(#fill${id})`} />
      <path d="M0 112 L24 105 42 110 62 75 82 96 104 88 126 98 148 46 170 79 192 70 214 87 236 53 258 61 280 32 302 48 324 52 346 16 368 39 390 29 412 47 440 20" fill="none" stroke="#c27647" strokeWidth="2.5" strokeLinejoin="round" />
      {!compact && <path d="M0 120 H58 V100 H118 V82 H200 V62 H280 V38 H352 V22 H440" fill="none" stroke="#205b50" strokeWidth="2" strokeDasharray="4 4" />}
    </svg><div className="sp-demo-axis"><span>01 Oct</span><span>10 Oct</span><span>20 Oct</span><span>30 Oct</span></div>
  </div>;
}

function Donut() {
  return <div className="sp-demo-donut-wrap"><div className="sp-demo-donut" role="img" aria-label="Fictional category proportions: Food 45%, Home 25%, Lifestyle 20%, Other 10%"><span>Category total<strong>€1,284.50</strong></span></div><div className="sp-demo-legend">{[['Food', '45%', '#205b50'], ['Home', '25%', '#c27647'], ['Lifestyle', '20%', '#497ea0'], ['Other', '10%', '#a9b6a1']].map(([name, value, color]) => <span key={name}><i style={{ background: color }} />{name}<b>{value}</b></span>)}</div></div>;
}

function DashboardDemo() {
  const [period, setPeriod] = useState('Month');
  const amounts: Record<string, [string, string, string]> = { Day: ['€73.30', '€0.00', '−€73.30'], Week: ['€363.70', '€0.00', '−€363.70'], Month: ['€1,284.50', '€3,200.00', '€1,915.50'], Year: ['€1,284.50', '€3,200.00', '€1,915.50'], Total: ['€1,284.50', '€3,200.00', '€1,915.50'] };
  return <><div className="sp-demo-balance"><div><span>Total account balance · EUR</span><strong>€8,460.50</strong><small>Current recorded balances</small></div><WalletCards size={22} /></div>
    <div className="sp-demo-period" role="group" aria-label="Example period">{Object.keys(amounts).map(value => <button key={value} aria-pressed={value === period} onClick={() => setPeriod(value)}>{value}</button>)}</div>
    <div className="sp-demo-metrics" aria-live="polite">{['Spending', 'Income', 'Net cash flow'].map((label, index) => <div key={label}><span>{label} · EUR</span><strong>{amounts[period]![index]}</strong><small>{index === 0 ? 'Recorded spending' : index === 1 ? 'Recorded income' : 'Income minus spending'}</small></div>)}</div>
    <div className="sp-demo-charts"><div className="sp-demo-panel"><h4>Money over time</h4><small>{period} · illustrative trend</small><div className="sp-demo-chart-key"><span>● Spending</span><span>● Income</span></div><Trend /></div><div className="sp-demo-panel"><h4>Where your money went</h4><small>Spending by category · EUR</small><Donut /></div></div>
    <div className="sp-demo-bottom"><div className="sp-demo-panel"><h4>Your accounts</h4><div className="sp-demo-account-line"><WalletCards /><span>Everyday account<small>EUR · checking</small></span><b>€3,460.50</b></div><div className="sp-demo-account-line"><Landmark /><span>Savings<small>EUR · savings</small></span><b>€5,000.00</b></div></div><div className="sp-demo-panel"><h4>Recent activity</h4>{transactions.slice(0, 2).map(item => <div className="sp-demo-activity" key={item.title}><span>{item.title}<small>{item.category}</small></span><b>{item.amount}</b></div>)}</div></div>
  </>;
}

function TransactionsDemo() {
  const [filter, setFilter] = useState('All types');
  const visible = transactions.filter(item => filter === 'All types' || (filter === 'Expenses' ? item.amount.startsWith('−') : item.category === 'Income'));
  return <><div className="sp-demo-filters" role="group" aria-label="Example transaction filters">{['All types', 'Expenses', 'Income'].map(item => <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div><p className="sp-demo-hint">Your money in and out. Transfers do not count as spending.</p><div className="sp-demo-transactions" aria-live="polite">{visible.map(item => <div key={item.title}><i className={`sp-demo-icon sp-${item.tone}`}>{item.icon}</i><span><b>{item.title}</b><small>Everyday account · {item.category}</small></span><strong>{item.amount}</strong></div>)}</div><div className="sp-demo-note"><ReceiptText /><span>Every entry has a little more context.<small>Account, category, date and a note.</small></span></div></>;
}

function AccountsDemo() {
  return <><p className="sp-demo-hint">Each account, in its own currency. Balances reflect recorded transactions.</p><div className="sp-demo-account-cards">{[['Everyday account', 'Checking · EUR', '€3,460.50'], ['Savings', 'Savings · EUR', '€5,000.00'], ['Cash wallet', 'Cash · EUR', '€0.00']].map(([name, type, balance], i) => <div key={name}><span className={`sp-demo-icon sp-${i === 1 ? 'green' : 'orange'}`}><WalletCards size={20} /></span><small>{type}</small><h4>{name}</h4><strong>{balance}</strong><span className="sp-demo-manage">Recorded balance</span></div>)}</div><div className="sp-demo-note"><CircleDollarSign /><span>A starting point that makes sense.<small>Opening balances are separate from income. Currencies stay separate.</small></span></div></>;
}

function PlanningDemo() {
  return <div className="sp-demo-planning"><div className="sp-demo-panel"><span className="sp-demo-tag">Assets · appreciating</span><h4>Long-term investment</h4><strong>€6,800.00</strong><p>Contributed principal <b>€6,000.00</b></p><p className="sp-demo-gain">▲ €800.00 · 13.33% simple return</p><Trend compact /><small>Illustrative recorded valuations</small></div><div className="sp-demo-panel"><span className="sp-demo-tag">Debts & loans</span><h4>Personal loan</h4><strong>€2,400.00</strong><small>remaining of €4,000.00</small><div className="sp-demo-progress"><i /></div><small>Recorded repayments reduce what remains.</small></div><div className="sp-demo-panel"><span className="sp-demo-tag">Regular payments · template</span><h4>Monthly internet</h4><strong>€29.00</strong><small>Every month · next 05 Nov</small><p>Reminder only. No automatic payments.</p></div></div>;
}

/** Isolated fictional data. This component never calls a financial API. */
export function ProductPreview({ kind = 'dashboard', sidebar = true }: { kind?: PreviewKind; sidebar?: boolean }) {
  const active = { dashboard: 'Home', transactions: 'Transactions', accounts: 'Accounts', planning: 'Assets' }[kind];
  return <div className={`sp-product-preview ${sidebar ? '' : 'sp-preview-no-sidebar'}`}>
    <div className="sp-demo-browser"><span aria-hidden="true"><i /><i /><i /></span><span><img src="/brand-mark.svg" width="12" height="12" alt="" />Spendime · product preview</span><span>Sample data</span></div>
    <div className="sp-demo-shell">{sidebar && <aside className="sp-demo-sidebar" aria-label="Illustrated app sidebar"><div className="sp-demo-brand"><CircleDollarSign size={19} />Spendime</div><div className="sp-demo-add"><Plus size={12} />Add transaction</div><small>EVERYDAY MONEY</small>{nav.map(([name, Icon], i) => <div className={name === active ? 'sp-demo-active' : ''} key={name}>{i === 3 && <small>ORGANIZE & PLAN</small>}<span><Icon size={13} />{name}</span></div>)}<div className="sp-demo-sidebar-foot">Your money.<br />Your perspective.</div></aside>}
      <div className="sp-demo-main"><div className="sp-demo-heading"><div><small>{kind === 'dashboard' ? 'YOUR MONEY, CLEARLY' : 'MONEY, IN CONTEXT'}</small><h3>{kind === 'dashboard' ? 'Hello, Ivo' : kind === 'transactions' ? 'Transactions' : kind === 'accounts' ? 'Money accounts' : 'The bigger picture'}</h3><p>{kind === 'dashboard' ? 'A clear picture of what you have and where it goes.' : 'Illustrative preview · all amounts are fictional'}</p></div><span className="sp-demo-action"><Plus size={11} />{kind === 'accounts' ? 'Add account' : 'Add transaction'}</span></div>
        {kind === 'dashboard' ? <DashboardDemo /> : kind === 'transactions' ? <TransactionsDemo /> : kind === 'accounts' ? <AccountsDemo /> : <PlanningDemo />}
      </div></div>
  </div>;
}

