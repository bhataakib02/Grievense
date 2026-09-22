import React from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRouter } from '../hooks/useRouter';
import { BlockchainNetworkCard } from '../components/blockchain/BlockchainNetworkCard';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Alert } from '../components/common/Alert';

export function LandingPage() {
  const { isConnected, hasMetaMask, connectWallet, error, clearError } = useWallet();
  const { navigate } = useRouter();

  const quickActions = [
    {
      id: 'submit',
      title: 'Submit a Grievance',
      icon: '📝',
      description: 'Lodge a formal municipal or departmental grievance with cryptographic IPFS evidence.',
      actionText: 'Submit Grievance',
      onClick: () => navigate('/citizen/submit'),
      highlight: true,
    },
    {
      id: 'track',
      title: 'Track My Grievance',
      icon: '🔍',
      description: 'Monitor ongoing investigation milestones, officer updates, and SLA countdowns in real time.',
      actionText: 'Track Status',
      onClick: () => navigate('/citizen'),
      highlight: false,
    },
    {
      id: 'verify',
      title: 'Verify a Grievance',
      icon: '🛡️',
      description: 'Cryptographically confirm that off-chain evidence hashes match immutable on-chain records.',
      actionText: 'Verify Record',
      onClick: () => navigate('/verify'),
      highlight: false,
    },
    {
      id: 'public-records',
      title: 'View Public Records',
      icon: '🏛️',
      description: 'Inspect the decentralized audit ledger and open departmental resolution histories.',
      actionText: 'Browse Records',
      onClick: () => navigate('/verify'),
      highlight: false,
    },
  ];

  const steps = [
    {
      step: '01',
      title: 'Submit',
      subtitle: 'Citizen submits grievance',
      desc: 'Citizen files a ticket with title, department, priority, and tamper-proof IPFS attachments.',
      icon: '📤',
    },
    {
      step: '02',
      title: 'Register',
      subtitle: 'Department registers & triages',
      desc: 'Department administrator verifies jurisdiction, registers on-chain, and assigns a field officer.',
      icon: '🏢',
    },
    {
      step: '03',
      title: 'Investigate',
      subtitle: 'Officer investigates case',
      desc: 'Field officer conducts investigation, logging on-chain forensic notes and attaching evidence.',
      icon: '🔎',
    },
    {
      step: '04',
      title: 'Resolve',
      subtitle: 'Officer submits resolution',
      desc: 'Formal remediation plan is submitted on-chain for citizen review before SLA expiration.',
      icon: '✅',
    },
    {
      step: '05',
      title: 'Verify',
      subtitle: 'Citizen & public verify',
      desc: 'Citizen confirms satisfactory closure or disputes; entire audit history remains permanently verifiable.',
      icon: '🔒',
    },
  ];

  const roleCards = [
    {
      role: 'SUPER ADMIN',
      rank: 'Level 4 • Highest Authority',
      badgeVariant: 'danger',
      desc: 'Manage departments, configure grievance categories, adjust global SLA tier durations, and inspect system-wide forensic audit logs.',
      route: '/super-admin',
      actionText: 'Enter Super Admin Center',
    },
    {
      role: 'DEPARTMENT ADMIN',
      rank: 'Level 3 • Supervisory',
      badgeVariant: 'neutral',
      desc: 'Manage departmental officer rosters, triage incoming grievances, assign investigations, and resolve overdue SLA escalations.',
      route: '/dept-admin',
      actionText: 'Enter Department Console',
    },
    {
      role: 'OFFICER',
      rank: 'Level 2 • Field Operations',
      badgeVariant: 'warning',
      desc: 'Conduct assigned field investigations, log immutable milestone notes, upload inspection evidence, and submit proposed resolutions.',
      route: '/officer',
      actionText: 'Enter Officer Console',
    },
    {
      role: 'CITIZEN',
      rank: 'Level 1 • Public User',
      badgeVariant: 'primary',
      desc: 'Self-register on-chain, file new grievances, monitor progress, and review proposed resolutions with full acceptance/rejection authority.',
      route: '/citizen',
      actionText: 'Enter Citizen Portal',
    },
  ];

  const transparencyFeatures = [
    {
      title: 'Tamper-Evident Records',
      icon: '⛓️',
      desc: 'Important grievance state changes, status transitions, and departmental handoffs are recorded on the Ethereum blockchain. No authority can secretly alter history or delete records.',
    },
    {
      title: 'Cryptographic Verification',
      icon: '🔐',
      desc: 'Off-chain documents, complaint descriptions, and evidence photos stored on IPFS are bound to the smart contract via SHA-256 and Keccak-256 hashes for mathematical proof of authenticity.',
    },
    {
      title: 'Public Accountability',
      icon: '⚖️',
      desc: 'Citizens, independent auditors, and media can independently verify any grievance resolution history without needing special administrative credentials or private access.',
    },
  ];

  return (
    <div className="space-y-16 sm:space-y-20">
      {/* Wallet Error Alert */}
      {error && (
        <Alert variant="danger" title="Wallet Error" onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* 1. HERO SECTION */}
      <section className="text-center max-w-4xl mx-auto pt-4 sm:pt-8">
        {/* Civic Trust Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold mb-6">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
          <span>Official Republic Civic Administration Protocol</span>
        </div>

        {/* Headline */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.12]">
          Transparent Public Grievance Resolution,{' '}
          <span className="text-blue-600">Powered by Blockchain</span>
        </h1>

        {/* Supporting text */}
        <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Submit, track and verify public grievances through a tamper-evident decentralized system with transparent departmental accountability.
        </p>

        {/* Primary & Secondary CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Button
            onClick={() => navigate('/citizen/submit')}
            variant="primary"
            size="lg"
            className="w-full sm:w-auto font-bold shadow-md hover:shadow-lg"
          >
            Submit a Grievance
          </Button>

          <Button
            onClick={() => navigate('/citizen')}
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto font-bold"
          >
            Track a Grievance
          </Button>

          <button
            onClick={() => navigate('/verify')}
            type="button"
            className="text-xs font-bold text-slate-600 hover:text-blue-600 py-2 px-3 transition-colors cursor-pointer inline-flex items-center gap-1"
          >
            <span>Verify On-Chain</span>
            <span>→</span>
          </button>
        </div>

        {/* Subtle Visual Flow: Citizen → Department → Officer → Resolution */}
        <div className="mt-12 p-3 sm:p-4 bg-white/80 backdrop-blur-xs rounded-2xl border border-slate-200/80 shadow-2xs max-w-2xl mx-auto">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">
                👤
              </span>
              <span>Citizen</span>
            </div>
            <span className="text-slate-300 font-bold">→</span>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold">
                🏛️
              </span>
              <span>Department</span>
            </div>
            <span className="text-slate-300 font-bold">→</span>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold">
                👮
              </span>
              <span>Officer</span>
            </div>
            <span className="text-slate-300 font-bold">→</span>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">
                ✓
              </span>
              <span>Resolution</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. SYSTEM STATUS: Compact Blockchain Network Card */}
      <section className="max-w-4xl mx-auto">
        <BlockchainNetworkCard />
      </section>

      {/* 3. QUICK ACTIONS: "What would you like to do?" */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            What would you like to do?
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1.5">
            Choose a civic service to begin. All records are backed by decentralized smart contracts.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {quickActions.map((action) => (
            <div
              key={action.id}
              onClick={action.onClick}
              className={`p-6 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group ${
                action.highlight
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md hover:bg-blue-700 hover:shadow-lg'
                  : 'bg-white text-slate-900 border-slate-200/90 shadow-xs hover:border-blue-300 hover:shadow-md'
              }`}
            >
              <div>
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 ${
                    action.highlight
                      ? 'bg-white/15 text-white'
                      : 'bg-slate-100 text-slate-800 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors'
                  }`}
                >
                  {action.icon}
                </div>
                <h3
                  className={`text-base font-bold mb-2 ${
                    action.highlight ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {action.title}
                </h3>
                <p
                  className={`text-xs leading-relaxed ${
                    action.highlight ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  {action.description}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-current/10 flex items-center justify-between text-xs font-bold">
                <span>{action.actionText}</span>
                <span className="transform group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. HOW THE SYSTEM WORKS: 5-step horizontal timeline */}
      <section id="how-it-works" className="space-y-8 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto">
          <Badge variant="primary" className="mb-2">
            Civic Process Flow
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            How The System Works
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            A 5-step transparent journey from citizen submission to tamper-proof verification.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
          {steps.map((item) => (
            <div
              key={item.step}
              className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between civic-card-hover relative"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                    {item.step}
                  </span>
                  <span className="text-xl">{item.icon}</span>
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {item.title}
                </h3>
                <div className="text-[11px] font-semibold text-blue-700 mt-0.5 mb-2">
                  {item.subtitle}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. ROLE-BASED ACCESS: "One Platform. Four Levels of Accountability." */}
      <section className="space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <Badge variant="neutral" className="mb-2">
            Governance Hierarchy
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            One Platform. Four Levels of Accountability.
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Access and capabilities are strictly governed on-chain by the RoleManager smart contract.
          </p>

          {/* Visual hierarchy indicator */}
          <div className="mt-4 inline-flex items-center justify-center gap-2 text-xs font-bold text-slate-500 bg-slate-100 px-4 py-1.5 rounded-full">
            <span>SUPER ADMIN</span>
            <span>↓</span>
            <span>DEPT ADMIN</span>
            <span>↓</span>
            <span>OFFICER</span>
            <span>↓</span>
            <span>CITIZEN</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {roleCards.map((rc) => (
            <div
              key={rc.role}
              className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between civic-card-hover"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={rc.badgeVariant} dot className="font-bold text-[10px]">
                    {rc.role}
                  </Badge>
                </div>
                <div className="text-[11px] font-bold text-slate-400 mb-3">
                  {rc.rank}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {rc.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button
                  onClick={() => navigate(rc.route)}
                  variant="secondary"
                  size="sm"
                  className="w-full text-xs font-bold"
                >
                  {rc.actionText} →
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. TRANSPARENCY SECTION: Why blockchain is used */}
      <section className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-800">
        <div className="max-w-3xl">
          <Badge variant="neutral" className="bg-slate-800 text-blue-300 border-slate-700 mb-3 font-bold">
            Public Trust & Integrity
          </Badge>
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Why Public Grievance Tracking Belongs On-Chain
          </h2>
          <p className="text-slate-400 mt-3 text-sm sm:text-base leading-relaxed">
            Centralized systems suffer from opaque delays, quiet case deletions, and untracked SLA violations. Our blockchain architecture replaces administrative opacity with verifiable proof.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10 pt-8 border-t border-slate-800">
          {transparencyFeatures.map((tf) => (
            <div key={tf.title} className="space-y-2">
              <div className="text-2xl mb-2">{tf.icon}</div>
              <h3 className="font-bold text-slate-100 text-base">
                {tf.title}
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                {tf.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
