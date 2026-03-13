import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import {
  BillingOverview,
  BillingPlan,
  BillingInvoice,
  BillingUsageItem,
  BillingSubscription
} from '../types.js';
import {
  CreditCard,
  Download,
  AlertTriangle,
  CheckCircle,
  Settings,
  RefreshCw,
  ExternalLink,
  Info
} from 'lucide-react';
import { sectionLabel, statNumber, monoXs, monoSm, cardSurface, statusPill, tableHeaderClass, infoPanel, getStatusAccent } from '../styles/tokens';
import Modal from '../components/ui/Modal';

export default function Billing() {
  const { organization, admin } = useAuth();
  const [billingData, setBillingData] = useState<BillingOverview | null>(null);
  const [availablePlans, setAvailablePlans] = useState<BillingPlan[]>([]);
  const [usageHistory, setUsageHistory] = useState<BillingUsageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'usage' | 'invoices' | 'plans'>('overview');
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    loadBillingData();
  }, [organization]);

  const loadBillingData = async () => {
    if (!organization) return;

    try {
      setLoading(true);
      const [overview, plans, usage] = await Promise.all([
        apiClient.getBillingOverview(organization.id),
        apiClient.listBillingPlans(),
        apiClient.getBillingUsageHistory(organization.id, {
          start_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          end_date: new Date().toISOString(),
          granularity: 'day'
        })
      ]);

      setBillingData(overview);
      setAvailablePlans(plans);
      setUsageHistory(usage);
    } catch (error) {
      console.error('Failed to load billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChange = async (planId: string, billingCycle: 'monthly' | 'yearly') => {
    if (!billingData?.current_subscription) return;

    try {
      await apiClient.changeBillingPlan(billingData.current_subscription.id, planId, billingCycle);
      await loadBillingData(); // Refresh data
      setShowPlanModal(false);
    } catch (error) {
      console.error('Failed to change plan:', error);
      alert('Failed to change billing plan');
    }
  };

  const downloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const blob = await apiClient.downloadInvoice(invoiceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download invoice:', error);
      alert('Failed to download invoice');
    }
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount / 100); // Assuming amounts are in cents
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const canManageBilling = admin?.permissions.manage_billing || false;

  if (!canManageBilling) {
    return (
      <div className="p-6">
        <div className="text-center">
          <CreditCard className="mx-auto h-12 w-12 text-slate-500" />
          <h3 className="mt-2 text-sm font-medium text-slate-100">Access Denied</h3>
          <p className="mt-1 text-sm text-slate-500">
            You don't have permission to view billing information.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className={`${cardSurface} h-8 w-1/4`}>
            <div className="bg-slate-700/50 h-full rounded-xl" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`${cardSurface} h-24`}>
                <div className="bg-slate-700/50 h-full rounded-xl" />
              </div>
            ))}
          </div>
          <div className={`${cardSurface} h-96`}>
            <div className="bg-slate-700/50 h-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', name: 'Overview' },
    { id: 'usage', name: 'Usage Details' },
    { id: 'invoices', name: 'Billing History' },
    { id: 'plans', name: 'Plans & Pricing' }
  ];

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start space-y-4 lg:space-y-0">
        <div>
          <p className={sectionLabel}>Billing & Usage</p>
          <p className="text-slate-400 text-sm mt-1">Manage your subscription, view usage, and track billing history</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadBillingData}
            className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 px-3 py-1.5 rounded-lg text-sm font-mono transition-colors flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>

          <button
            onClick={() => setShowPlanModal(true)}
            className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 px-3 py-1.5 rounded-lg text-sm font-mono transition-colors flex items-center"
          >
            Manage Plan
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-4 px-1 border-b-2 font-mono text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-cyan-400 text-cyan-200'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && billingData && (
        <BillingOverviewTab billingData={billingData} />
      )}

      {activeTab === 'usage' && billingData && (
        <UsageDetailsTab
          billingData={billingData}
          usageHistory={usageHistory}
        />
      )}

      {activeTab === 'invoices' && billingData && (
        <InvoicesTab
          invoices={billingData.billing_history}
          onDownloadInvoice={downloadInvoice}
        />
      )}

      {activeTab === 'plans' && (
        <PlansTab
          plans={availablePlans}
          currentSubscription={billingData?.current_subscription}
          billingCycle={selectedBillingCycle}
          onBillingCycleChange={setSelectedBillingCycle}
          onPlanChange={handlePlanChange}
        />
      )}

      {/* Plan Change Modal */}
      {showPlanModal && billingData && (
        <PlanChangeModal
          currentSubscription={billingData.current_subscription}
          availablePlans={availablePlans}
          onClose={() => setShowPlanModal(false)}
          onPlanChange={handlePlanChange}
        />
      )}
    </div>
  );
}

interface BillingOverviewTabProps {
  billingData: BillingOverview;
}

function BillingOverviewTab({ billingData }: BillingOverviewTabProps) {
  const { current_subscription, usage_current_period, upcoming_invoice, payment_method } = billingData;

  const usagePercentage = current_subscription && usage_current_period
    ? (usage_current_period.current_period.verification_count / usage_current_period.monthly_limit) * 100
    : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: current_subscription.currency.toUpperCase()
    }).format(amount / 100);
  };

  return (
    <div className="space-y-6">
      {/* Subscription Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className={`${cardSurface} border-l-[3px] border-l-purple-400 p-5`}>
          <p className={sectionLabel}>Current Plan</p>
          <p className={statNumber}>{current_subscription.plan_name}</p>
          <p className={`${monoXs} text-slate-500 capitalize`}>{current_subscription.billing_cycle}</p>
        </div>

        <div className={`${cardSurface} border-l-[3px] border-l-emerald-400 p-5`}>
          <p className={sectionLabel}>Monthly Cost</p>
          <p className={statNumber}>
            {formatCurrency(current_subscription.amount)}
          </p>
          <span className={`${statusPill} ${getStatusAccent(current_subscription.status).pill}`}>
            {current_subscription.status.replace('_', ' ')}
          </span>
        </div>

        <div className={`${cardSurface} border-l-[3px] border-l-cyan-400 p-5`}>
          <p className={sectionLabel}>Usage This Period</p>
          <p className={statNumber}>
            {usage_current_period.current_period.verification_count.toLocaleString()}
          </p>
          <p className={`${monoXs} text-slate-500`}>
            of {usage_current_period.monthly_limit.toLocaleString()} verifications
          </p>
        </div>

        <div className={`${cardSurface} border-l-[3px] border-l-amber-400 p-5`}>
          <p className={sectionLabel}>Next Billing</p>
          <p className={statNumber}>
            {new Date(current_subscription.current_period_end).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            })}
          </p>
          <p className={`${monoXs} text-slate-500`}>
            {upcoming_invoice ? formatCurrency(upcoming_invoice.amount_due) : 'TBD'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Progress */}
        <div className={`${cardSurface} p-5`}>
          <p className={sectionLabel}>Current Usage</p>

          <div className="space-y-4 mt-4">
            <div>
              <div className="flex justify-between text-sm text-slate-400 mb-2">
                <span>Verifications</span>
                <span className={monoXs}>{usage_current_period.current_period.verification_count} / {usage_current_period.monthly_limit}</span>
              </div>
              <div className="w-full bg-slate-700/50 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    usagePercentage > 90 ? 'bg-red-500' :
                    usagePercentage > 75 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                />
              </div>
              <p className={`${monoXs} text-slate-500 mt-1`}>
                {usagePercentage.toFixed(1)}% of monthly limit used
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className={sectionLabel}>API Calls</p>
                <p className={`${monoSm} font-semibold text-slate-100 mt-1`}>
                  {usage_current_period.current_period.api_calls.toLocaleString()}
                </p>
              </div>
              <div>
                <p className={sectionLabel}>Storage Used</p>
                <p className={`${monoSm} font-semibold text-slate-100 mt-1`}>
                  {usage_current_period.current_period.storage_used_mb.toFixed(1)} MB
                </p>
              </div>
            </div>

            {usage_current_period.current_period.verification_count > usage_current_period.monthly_limit && (
              <div className="bg-rose-500/12 border border-rose-500/30 rounded-lg p-3">
                <div className="flex">
                  <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                  <div className="ml-2">
                    <h4 className={`${monoXs} font-medium text-rose-200`}>Overage Alert</h4>
                    <p className="text-xs text-rose-300 mt-1">
                      You've exceeded your monthly limit by{' '}
                      {(usage_current_period.current_period.verification_count - usage_current_period.monthly_limit).toLocaleString()} verifications.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Payment Information */}
        <div className={`${cardSurface} p-5`}>
          <p className={sectionLabel}>Payment Information</p>

          {payment_method ? (
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`${monoXs} w-8 h-5 bg-slate-800 rounded text-white font-bold flex items-center justify-center`}>
                    {payment_method.type.toUpperCase()}
                  </div>
                  <div className="ml-3">
                    <p className={`${monoSm} font-medium text-slate-100`}>
                      •••• •••• •••• {payment_method.last4}
                    </p>
                    <p className={`${monoXs} text-slate-500`}>
                      Expires {payment_method.exp_month}/{payment_method.exp_year}
                    </p>
                  </div>
                </div>
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>

              {upcoming_invoice && (
                <div className={infoPanel}>
                  <div className="flex items-center">
                    <Info className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    <div className="ml-2">
                      <p className={sectionLabel}>Upcoming Invoice</p>
                      <p className={`${monoSm} text-cyan-300 mt-1`}>
                        {formatCurrency(upcoming_invoice.amount_due)} due on{' '}
                        <span className={monoXs}>{new Date(upcoming_invoice.due_date).toLocaleDateString()}</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <button className="w-full text-left px-3 py-2 text-sm text-cyan-400 hover:bg-cyan-500/12 rounded-md transition-colors">
                <Settings className="h-4 w-4 inline mr-2" />
                Update Payment Method
              </button>
            </div>
          ) : (
            <div className="text-center py-4 mt-4">
              <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
              <p className="text-sm text-slate-400 mb-3">No payment method on file</p>
              <button className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 px-4 py-2 rounded-lg text-sm font-mono transition-colors">
                Add Payment Method
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface UsageDetailsTabProps {
  billingData: BillingOverview;
  usageHistory: BillingUsageItem[];
}

function UsageDetailsTab({ billingData, usageHistory }: UsageDetailsTabProps) {
  const totalVerifications = usageHistory.reduce((sum, item) => sum + item.verifications, 0);
  const totalApiCalls = usageHistory.reduce((sum, item) => sum + item.api_calls, 0);
  const totalOverage = usageHistory.reduce((sum, item) => sum + item.overage_cost, 0);

  return (
    <div className="space-y-6">
      {/* Usage Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`${cardSurface} border-l-[3px] border-l-cyan-400 p-5`}>
          <p className={sectionLabel}>Total Verifications</p>
          <p className={statNumber}>{totalVerifications.toLocaleString()}</p>
          <p className={`${monoXs} text-slate-500`}>Last 90 days</p>
        </div>

        <div className={`${cardSurface} border-l-[3px] border-l-emerald-400 p-5`}>
          <p className={sectionLabel}>API Calls</p>
          <p className={statNumber}>{totalApiCalls.toLocaleString()}</p>
          <p className={`${monoXs} text-slate-500`}>Last 90 days</p>
        </div>

        <div className={`${cardSurface} border-l-[3px] border-l-rose-400 p-5`}>
          <p className={sectionLabel}>Overage Costs</p>
          <p className={statNumber}>
            ${totalOverage.toFixed(2)}
          </p>
          <p className={`${monoXs} text-slate-500`}>Last 90 days</p>
        </div>
      </div>

      {/* Usage Chart Placeholder */}
      <div className={`${cardSurface} p-5`}>
        <p className={sectionLabel}>Usage Trends</p>
        <div className="h-64 flex items-center justify-center border-2 border-white/10 border-dashed rounded-lg mt-4">
          <div className="text-center">
            <span className={`${monoSm} block font-medium text-slate-100`}>
              Usage Charts Coming Soon
            </span>
            <span className="block text-sm text-slate-500 mt-1">
              Visual representation of your usage patterns over time
            </span>
          </div>
        </div>
      </div>

      {/* Recent Usage Table */}
      <div className={cardSurface}>
        <div className="p-5 border-b border-white/10">
          <p className={sectionLabel}>Recent Daily Usage</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-slate-900/40">
              <tr>
                <th className={tableHeaderClass}>Date</th>
                <th className={tableHeaderClass}>Verifications</th>
                <th className={tableHeaderClass}>API Calls</th>
                <th className={tableHeaderClass}>Storage (MB)</th>
                <th className={tableHeaderClass}>Overage Cost</th>
              </tr>
            </thead>
            <tbody className="bg-slate-900/70 divide-y divide-white/10">
              {usageHistory.slice(-10).reverse().map((item) => (
                <tr key={item.date} className="hover:bg-slate-800/40 transition-colors">
                  <td className={`px-5 py-4 whitespace-nowrap ${monoXs} text-slate-100`}>
                    {new Date(item.date).toLocaleDateString()}
                  </td>
                  <td className={`px-5 py-4 whitespace-nowrap ${monoSm} text-slate-100`}>
                    {item.verifications.toLocaleString()}
                    {item.overage_verifications > 0 && (
                      <span className={`ml-1 ${monoXs} text-red-400`}>
                        (+{item.overage_verifications})
                      </span>
                    )}
                  </td>
                  <td className={`px-5 py-4 whitespace-nowrap ${monoSm} text-slate-100`}>
                    {item.api_calls.toLocaleString()}
                  </td>
                  <td className={`px-5 py-4 whitespace-nowrap ${monoSm} text-slate-100`}>
                    {item.storage_mb.toFixed(1)}
                  </td>
                  <td className={`px-5 py-4 whitespace-nowrap ${monoSm}`}>
                    {item.overage_cost > 0 ? (
                      <span className="text-red-400">${item.overage_cost.toFixed(2)}</span>
                    ) : (
                      <span className="text-slate-500">$0.00</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface InvoicesTabProps {
  invoices: BillingInvoice[];
  onDownloadInvoice: (invoiceId: string, invoiceNumber: string) => void;
}

function InvoicesTab({ invoices, onDownloadInvoice }: InvoicesTabProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className={cardSurface}>
      <div className="p-5 border-b border-white/10">
        <p className={sectionLabel}>Billing History</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-slate-900/40">
            <tr>
              <th className={tableHeaderClass}>Invoice</th>
              <th className={tableHeaderClass}>Period</th>
              <th className={tableHeaderClass}>Amount</th>
              <th className={tableHeaderClass}>Status</th>
              <th className={tableHeaderClass}>Due Date</th>
              <th className={tableHeaderClass}>Actions</th>
            </tr>
          </thead>
          <tbody className="bg-slate-900/70 divide-y divide-white/10">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-4 text-center text-slate-500">
                  No invoices found
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className={`${monoSm} font-medium text-slate-100`}>
                      #{invoice.number}
                    </div>
                    <div className={`${monoXs} text-slate-500`}>
                      {formatDate(invoice.created_at)}
                    </div>
                  </td>
                  <td className={`px-5 py-4 whitespace-nowrap ${monoXs} text-slate-100`}>
                    {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
                  </td>
                  <td className={`px-5 py-4 whitespace-nowrap ${monoSm} text-slate-100`}>
                    {formatCurrency(invoice.amount_due, invoice.currency)}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className={`${statusPill} ${getStatusAccent(invoice.status).pill}`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className={`px-5 py-4 whitespace-nowrap ${monoXs} text-slate-100`}>
                    {formatDate(invoice.due_date)}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onDownloadInvoice(invoice.id, invoice.number)}
                        className="text-cyan-400 hover:text-cyan-300 transition-colors"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {invoice.invoice_url && (
                        <a
                          href={invoice.invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-slate-200 transition-colors"
                          title="View online"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PlansTabProps {
  plans: BillingPlan[];
  currentSubscription?: BillingSubscription;
  billingCycle: 'monthly' | 'yearly';
  onBillingCycleChange: (cycle: 'monthly' | 'yearly') => void;
  onPlanChange: (planId: string, billingCycle: 'monthly' | 'yearly') => void;
}

function PlansTab({
  plans,
  currentSubscription,
  billingCycle,
  onBillingCycleChange,
  onPlanChange
}: PlansTabProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount / 100);
  };

  return (
    <div className="space-y-6">
      {/* Billing Cycle Toggle */}
      <div className="flex justify-center">
        <div className="bg-slate-800/50 p-1 rounded-lg border border-white/10">
          <div className="flex">
            <button
              onClick={() => onBillingCycleChange('monthly')}
              className={`px-4 py-2 rounded-md font-mono text-sm transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-slate-700/70 text-slate-100'
                  : 'text-slate-500 hover:text-slate-100'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => onBillingCycleChange('yearly')}
              className={`px-4 py-2 rounded-md font-mono text-sm transition-colors ${
                billingCycle === 'yearly'
                  ? 'bg-slate-700/70 text-slate-100'
                  : 'text-slate-500 hover:text-slate-100'
              }`}
            >
              Yearly
              <span className={`ml-1 ${statusPill} ${getStatusAccent('active').pill}`}>
                Save 20%
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = currentSubscription?.plan_id === plan.id;
          const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
          const monthlyPrice = billingCycle === 'yearly' ? plan.price_yearly / 12 : plan.price_monthly;

          const borderColor = plan.is_popular
            ? 'border-l-cyan-400'
            : isCurrentPlan
            ? 'border-l-emerald-400'
            : 'border-l-slate-600';

          return (
            <div
              key={plan.id}
              className={`relative ${cardSurface} border-l-[3px] ${borderColor} p-5 ${
                plan.is_popular ? 'ring-1 ring-cyan-400/30' : ''
              }`}
            >
              {plan.is_popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className={`${statusPill} bg-cyan-500/20 text-cyan-200 border-cyan-400/40`}>
                    Most Popular
                  </span>
                </div>
              )}

              {isCurrentPlan && (
                <div className="absolute -top-3 right-4">
                  <span className={`${statusPill} ${getStatusAccent('active').pill}`}>
                    Current Plan
                  </span>
                </div>
              )}

              <div className="text-center pt-2">
                <p className={sectionLabel}>{plan.name}</p>
                <div className="mt-4">
                  <span className={statNumber}>
                    {formatCurrency(monthlyPrice)}
                  </span>
                  <span className={`${monoXs} text-slate-500`}>/month</span>
                  {billingCycle === 'yearly' && (
                    <div className={`${monoXs} text-slate-500 mt-1`}>
                      {formatCurrency(price)} billed yearly
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center text-sm text-slate-400">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                  {plan.verification_limit === -1
                    ? 'Unlimited verifications'
                    : `${plan.verification_limit.toLocaleString()} verifications/month`
                  }
                </div>
                <div className="flex items-center text-sm text-slate-400">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                  {plan.api_calls_limit === -1
                    ? 'Unlimited API calls'
                    : `${plan.api_calls_limit.toLocaleString()} API calls/month`
                  }
                </div>
                <div className="flex items-center text-sm text-slate-400">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                  {plan.storage_limit_gb === -1
                    ? 'Unlimited storage'
                    : `${plan.storage_limit_gb} GB storage`
                  }
                </div>
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-center text-sm text-slate-400">
                    <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>

              <div className="mt-6">
                {isCurrentPlan ? (
                  <button
                    disabled
                    className="w-full bg-slate-800/50 text-slate-500 py-2 px-4 rounded-lg font-mono text-sm cursor-not-allowed border border-white/10"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={() => onPlanChange(plan.id, billingCycle)}
                    className={`w-full py-2 px-4 rounded-lg font-mono text-sm transition-colors ${
                      plan.is_popular
                        ? 'bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30'
                        : 'bg-slate-700/50 border border-white/10 hover:bg-slate-700/70 text-white'
                    }`}
                  >
                    {currentSubscription ? 'Switch to Plan' : 'Get Started'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PlanChangeModalProps {
  currentSubscription: BillingSubscription;
  availablePlans: BillingPlan[];
  onClose: () => void;
  onPlanChange: (planId: string, billingCycle: 'monthly' | 'yearly') => void;
}

function PlanChangeModal({ currentSubscription, availablePlans, onClose, onPlanChange }: PlanChangeModalProps) {
  const [selectedPlanId, setSelectedPlanId] = useState(currentSubscription.plan_id);
  const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'yearly'>(currentSubscription.billing_cycle);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedPlanId === currentSubscription.plan_id &&
        selectedCycle === currentSubscription.billing_cycle) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      await onPlanChange(selectedPlanId, selectedCycle);
    } finally {
      setLoading(false);
    }
  };

  const selectedPlan = availablePlans.find(p => p.id === selectedPlanId);
  const currentPlan = availablePlans.find(p => p.id === currentSubscription.plan_id);

  return (
    <Modal isOpen={true} onClose={onClose} title="Change Billing Plan" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <p className={`${sectionLabel} mb-3`}>Select Plan</p>
          <div className="space-y-3">
            {availablePlans.map((plan) => (
              <label
                key={plan.id}
                className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedPlanId === plan.id
                    ? 'border-cyan-400 bg-cyan-500/12'
                    : 'border-white/10 hover:bg-slate-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={plan.id}
                  checked={selectedPlanId === plan.id}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="mr-3"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className={`${monoSm} font-medium text-slate-100`}>{plan.name}</h4>
                    <div className="text-right">
                      <div className={`${monoSm} font-bold text-slate-100`}>
                        ${((selectedCycle === 'yearly' ? plan.price_yearly : plan.price_monthly) / 100).toFixed(0)}/month
                      </div>
                      {selectedCycle === 'yearly' && (
                        <div className={`${monoXs} text-slate-500`}>
                          ${(plan.price_yearly / 100).toFixed(0)} billed yearly
                        </div>
                      )}
                    </div>
                  </div>
                  <p className={`${monoXs} text-slate-500 mt-1`}>
                    {plan.verification_limit === -1
                      ? 'Unlimited verifications'
                      : `${plan.verification_limit.toLocaleString()} verifications/month`
                    }
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className={`${sectionLabel} mb-3`}>Billing Cycle</p>
          <div className="space-y-2">
            <label className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
              selectedCycle === 'monthly'
                ? 'border-cyan-400 bg-cyan-500/12'
                : 'border-white/10 hover:bg-slate-800/40'
            }`}>
              <input
                type="radio"
                name="cycle"
                value="monthly"
                checked={selectedCycle === 'monthly'}
                onChange={(e) => setSelectedCycle('monthly')}
                className="mr-3"
              />
              <span className={`${monoSm} font-medium text-slate-100`}>Monthly billing</span>
            </label>

            <label className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
              selectedCycle === 'yearly'
                ? 'border-cyan-400 bg-cyan-500/12'
                : 'border-white/10 hover:bg-slate-800/40'
            }`}>
              <input
                type="radio"
                name="cycle"
                value="yearly"
                checked={selectedCycle === 'yearly'}
                onChange={(e) => setSelectedCycle('yearly')}
                className="mr-3"
              />
              <div className="flex items-center justify-between w-full">
                <span className={`${monoSm} font-medium text-slate-100`}>Yearly billing</span>
                <span className={`${statusPill} ${getStatusAccent('active').pill}`}>
                  Save 20%
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Change Summary */}
        {selectedPlan && currentPlan && (
          <div className={infoPanel}>
            <p className={sectionLabel}>Change Summary</p>
            <div className="space-y-1 text-sm text-slate-400">
              <div className="flex justify-between">
                <span>Current:</span>
                <span className={monoSm}>{currentPlan.name} ({currentSubscription.billing_cycle})</span>
              </div>
              <div className="flex justify-between">
                <span>New:</span>
                <span className={monoSm}>{selectedPlan.name} ({selectedCycle})</span>
              </div>
              <div className="flex justify-between font-medium text-slate-100 pt-2 border-t border-white/10">
                <span>New monthly cost:</span>
                <span className={monoSm}>
                  ${((selectedCycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly) / 100).toFixed(0)}/month
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-4 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-200 bg-slate-800 hover:bg-slate-700 font-mono text-sm rounded-lg transition-colors border border-white/10"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 px-4 py-2 rounded-lg font-mono text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || (selectedPlanId === currentSubscription.plan_id && selectedCycle === currentSubscription.billing_cycle)}
          >
            {loading ? (
              <div className="flex items-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Updating...
              </div>
            ) : (
              'Update Plan'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
