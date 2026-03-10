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
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  FileText,
  Settings,
  Zap,
  Crown,
  Star,
  RefreshCw,
  ExternalLink,
  Info,
  Package,
  BarChart3,
  Activity
} from 'lucide-react';

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

  const getStatusBadge = (status: string) => {
    const baseClass = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'active':
        return `${baseClass} bg-green-100 text-green-800`;
      case 'trialing':
        return `${baseClass} bg-blue-100 text-blue-800`;
      case 'past_due':
        return `${baseClass} bg-yellow-100 text-yellow-800`;
      case 'canceled':
        return `${baseClass} bg-red-100 text-red-800`;
      case 'paid':
        return `${baseClass} bg-green-100 text-green-800`;
      case 'open':
        return `${baseClass} bg-yellow-100 text-yellow-800`;
      case 'overdue':
        return `${baseClass} bg-red-100 text-red-800`;
      default:
        return `${baseClass} bg-gray-100 text-gray-800`;
    }
  };

  const canManageBilling = admin?.permissions.manage_billing || false;

  if (!canManageBilling) {
    return (
      <div className="p-6">
        <div className="text-center">
          <CreditCard className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Access Denied</h3>
          <p className="mt-1 text-sm text-gray-500">
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
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing & Usage</h1>
          <p className="text-gray-600 mt-1">Manage your subscription, view usage, and track billing history</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={loadBillingData}
            className="btn btn-secondary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          
          <button
            onClick={() => setShowPlanModal(true)}
            className="btn btn-primary"
          >
            <Package className="w-4 h-4 mr-2" />
            Manage Plan
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', name: 'Overview', icon: BarChart3 },
            { id: 'usage', name: 'Usage Details', icon: Activity },
            { id: 'invoices', name: 'Billing History', icon: FileText },
            { id: 'plans', name: 'Plans & Pricing', icon: Package }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600';
      case 'trialing': return 'text-blue-600';
      case 'past_due': return 'text-yellow-600';
      case 'canceled': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Subscription Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="stat-card-glass p-6">
          <div className="flex items-center">
            <Crown className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Current Plan</p>
              <p className="text-xl font-bold text-gray-900">{current_subscription.plan_name}</p>
              <p className="text-xs text-gray-500 capitalize">{current_subscription.billing_cycle}</p>
            </div>
          </div>
        </div>

        <div className="stat-card-glass p-6">
          <div className="flex items-center">
            <DollarSign className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Monthly Cost</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(current_subscription.amount)}
              </p>
              <p className={`text-xs font-medium ${getStatusColor(current_subscription.status)}`}>
                {current_subscription.status.replace('_', ' ').toUpperCase()}
              </p>
            </div>
          </div>
        </div>

        <div className="stat-card-glass p-6">
          <div className="flex items-center">
            <Activity className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Usage This Period</p>
              <p className="text-xl font-bold text-gray-900">
                {usage_current_period.current_period.verification_count.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">
                of {usage_current_period.monthly_limit.toLocaleString()} verifications
              </p>
            </div>
          </div>
        </div>

        <div className="stat-card-glass p-6">
          <div className="flex items-center">
            <Calendar className="h-8 w-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Next Billing</p>
              <p className="text-xl font-bold text-gray-900">
                {new Date(current_subscription.current_period_end).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </p>
              <p className="text-xs text-gray-500">
                {upcoming_invoice ? formatCurrency(upcoming_invoice.amount_due) : 'TBD'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Progress */}
        <div className="stat-card-glass p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
            Current Usage
          </h3>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Verifications</span>
                <span>{usage_current_period.current_period.verification_count} / {usage_current_period.monthly_limit}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    usagePercentage > 90 ? 'bg-red-500' : 
                    usagePercentage > 75 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {usagePercentage.toFixed(1)}% of monthly limit used
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">API Calls</p>
                <p className="font-semibold text-gray-900">
                  {usage_current_period.current_period.api_calls.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Storage Used</p>
                <p className="font-semibold text-gray-900">
                  {usage_current_period.current_period.storage_used_mb.toFixed(1)} MB
                </p>
              </div>
            </div>

            {usage_current_period.current_period.verification_count > usage_current_period.monthly_limit && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex">
                  <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  <div className="ml-2">
                    <h4 className="text-xs font-medium text-red-800">Overage Alert</h4>
                    <p className="text-xs text-red-700 mt-1">
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
        <div className="stat-card-glass p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <CreditCard className="h-5 w-5 mr-2 text-green-600" />
            Payment Information
          </h3>
          
          {payment_method ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-8 h-5 bg-gray-800 rounded text-white text-xs font-bold flex items-center justify-center">
                    {payment_method.type.toUpperCase()}
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">
                      •••• •••• •••• {payment_method.last4}
                    </p>
                    <p className="text-xs text-gray-500">
                      Expires {payment_method.exp_month}/{payment_method.exp_year}
                    </p>
                  </div>
                </div>
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>

              {upcoming_invoice && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center">
                    <Info className="h-4 w-4 text-blue-400 flex-shrink-0" />
                    <div className="ml-2">
                      <h4 className="text-xs font-medium text-blue-800">Upcoming Invoice</h4>
                      <p className="text-xs text-blue-700 mt-1">
                        {formatCurrency(upcoming_invoice.amount_due)} due on{' '}
                        {new Date(upcoming_invoice.due_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <button className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                <Settings className="h-4 w-4 inline mr-2" />
                Update Payment Method
              </button>
            </div>
          ) : (
            <div className="text-center py-4">
              <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-3">No payment method on file</p>
              <button className="btn btn-primary btn-sm">
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
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-blue-600">Total Verifications</p>
              <p className="text-2xl font-bold text-blue-900">{totalVerifications.toLocaleString()}</p>
              <p className="text-xs text-blue-700">Last 90 days</p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center">
            <Zap className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-green-600">API Calls</p>
              <p className="text-2xl font-bold text-green-900">{totalApiCalls.toLocaleString()}</p>
              <p className="text-xs text-green-700">Last 90 days</p>
            </div>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <DollarSign className="h-8 w-8 text-red-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-red-600">Overage Costs</p>
              <p className="text-2xl font-bold text-red-900">
                ${totalOverage.toFixed(2)}
              </p>
              <p className="text-xs text-red-700">Last 90 days</p>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Chart Placeholder */}
      <div className="content-card-glass p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage Trends</h3>
        <div className="h-64 flex items-center justify-center border-2 border-gray-200 border-dashed rounded-lg">
          <div className="text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
            <span className="mt-2 block text-sm font-medium text-gray-900">
              Usage Charts Coming Soon
            </span>
            <span className="block text-sm text-gray-500">
              Visual representation of your usage patterns over time
            </span>
          </div>
        </div>
      </div>

      {/* Recent Usage Table */}
      <div className="content-card-glass">
        <div className="p-6 border-b border-white/20">
          <h3 className="text-lg font-semibold text-gray-900">Recent Daily Usage</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Verifications
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  API Calls
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Storage (MB)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Overage Cost
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {usageHistory.slice(-10).reverse().map((item) => (
                <tr key={item.date} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(item.date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.verifications.toLocaleString()}
                    {item.overage_verifications > 0 && (
                      <span className="ml-1 text-xs text-red-600">
                        (+{item.overage_verifications})
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.api_calls.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.storage_mb.toFixed(1)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.overage_cost > 0 ? (
                      <span className="text-red-600">${item.overage_cost.toFixed(2)}</span>
                    ) : (
                      <span className="text-gray-500">$0.00</span>
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

  const getStatusBadge = (status: string) => {
    const baseClass = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'paid':
        return `${baseClass} bg-green-100 text-green-800`;
      case 'open':
        return `${baseClass} bg-yellow-100 text-yellow-800`;
      case 'overdue':
        return `${baseClass} bg-red-100 text-red-800`;
      default:
        return `${baseClass} bg-gray-100 text-gray-800`;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Billing History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invoice
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Period
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Due Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No invoices found
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      #{invoice.number}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(invoice.created_at)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(invoice.amount_due, invoice.currency)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={getStatusBadge(invoice.status)}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(invoice.due_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onDownloadInvoice(invoice.id, invoice.number)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {invoice.invoice_url && (
                        <a
                          href={invoice.invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-600 hover:text-gray-900"
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
        <div className="bg-gray-100 p-1 rounded-lg">
          <div className="flex">
            <button
              onClick={() => onBillingCycleChange('monthly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => onBillingCycleChange('yearly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingCycle === 'yearly'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Yearly
              <span className="ml-1 text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded">
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
          
          return (
            <div
              key={plan.id}
              className={`relative bg-white border-2 rounded-lg p-6 ${
                plan.is_popular
                  ? 'border-blue-500 shadow-lg'
                  : isCurrentPlan
                  ? 'border-green-500'
                  : 'border-gray-200'
              }`}
            >
              {plan.is_popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center">
                    <Star className="w-3 h-3 mr-1" />
                    Most Popular
                  </span>
                </div>
              )}

              {isCurrentPlan && (
                <div className="absolute -top-3 right-4">
                  <span className="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Current Plan
                  </span>
                </div>
              )}

              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                <div className="mt-4">
                  <span className="text-3xl font-bold text-gray-900">
                    {formatCurrency(monthlyPrice)}
                  </span>
                  <span className="text-gray-500">/month</span>
                  {billingCycle === 'yearly' && (
                    <div className="text-sm text-gray-500">
                      {formatCurrency(price)} billed yearly
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center text-sm text-gray-600">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                  {plan.verification_limit === -1 
                    ? 'Unlimited verifications' 
                    : `${plan.verification_limit.toLocaleString()} verifications/month`
                  }
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                  {plan.api_calls_limit === -1 
                    ? 'Unlimited API calls' 
                    : `${plan.api_calls_limit.toLocaleString()} API calls/month`
                  }
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                  {plan.storage_limit_gb === -1 
                    ? 'Unlimited storage' 
                    : `${plan.storage_limit_gb} GB storage`
                  }
                </div>
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-center text-sm text-gray-600">
                    <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>

              <div className="mt-6">
                {isCurrentPlan ? (
                  <button
                    disabled
                    className="w-full bg-gray-100 text-gray-500 py-2 px-4 rounded-lg font-medium cursor-not-allowed"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={() => onPlanChange(plan.id, billingCycle)}
                    className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                      plan.is_popular
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-900 hover:bg-gray-800 text-white'
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
    <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Change Billing Plan</h3>
            <p className="text-sm text-gray-500 mt-1">
              Update your subscription plan and billing cycle
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <Clock className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Plan
            </label>
            <div className="space-y-3">
              {availablePlans.map((plan) => (
                <label
                  key={plan.id}
                  className={`flex items-center p-4 border rounded-lg cursor-pointer ${
                    selectedPlanId === plan.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
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
                      <h4 className="font-medium text-gray-900">{plan.name}</h4>
                      <div className="text-right">
                        <div className="font-bold text-gray-900">
                          ${((selectedCycle === 'yearly' ? plan.price_yearly : plan.price_monthly) / 100).toFixed(0)}/month
                        </div>
                        {selectedCycle === 'yearly' && (
                          <div className="text-xs text-gray-500">
                            ${(plan.price_yearly / 100).toFixed(0)} billed yearly
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Billing Cycle
            </label>
            <div className="space-y-2">
              <label className={`flex items-center p-4 border rounded-lg cursor-pointer ${
                selectedCycle === 'monthly'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200'
              }`}>
                <input
                  type="radio"
                  name="cycle"
                  value="monthly"
                  checked={selectedCycle === 'monthly'}
                  onChange={(e) => setSelectedCycle('monthly')}
                  className="mr-3"
                />
                <span className="font-medium">Monthly billing</span>
              </label>
              
              <label className={`flex items-center p-4 border rounded-lg cursor-pointer ${
                selectedCycle === 'yearly'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200'
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
                  <span className="font-medium">Yearly billing</span>
                  <span className="text-sm bg-green-100 text-green-600 px-2 py-1 rounded">
                    Save 20%
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Change Summary */}
          {selectedPlan && currentPlan && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Change Summary</h4>
              <div className="space-y-1 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Current:</span>
                  <span>{currentPlan.name} ({currentSubscription.billing_cycle})</span>
                </div>
                <div className="flex justify-between">
                  <span>New:</span>
                  <span>{selectedPlan.name} ({selectedCycle})</span>
                </div>
                <div className="flex justify-between font-medium text-gray-900 pt-2 border-t border-gray-300">
                  <span>New monthly cost:</span>
                  <span>
                    ${((selectedCycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly) / 100).toFixed(0)}/month
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
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
      </div>
    </div>
  );
}
