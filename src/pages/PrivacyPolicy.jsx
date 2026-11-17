import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Shield, 
  Eye, 
  EyeOff,
  Lock,
  User,
  Database,
  Server,
  Mail,
  Trash2,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
  FileText,
  Cookie,
  Smartphone
} from 'lucide-react';

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleSection = (index) => {
    setExpandedSections(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const sections = [
    {
      title: '1. Information We Collect',
      content: `We collect information you provide directly to us, including:
• Account Information: name, email address, password, and profile picture
• Usage Data: features accessed, time spent, clicks, and navigation patterns
• Device Information: browser type, operating system, device identifiers
• Code and Files: code you submit for analysis, file names, and project structures
• Communication Data: support tickets, feedback, and correspondence`
    },
    {
      title: '2. How We Use Your Information',
      content: `We use the information we collect to:
• Provide, maintain, and improve our security scanning services
• Process and analyze code for vulnerability detection
• Send you service-related notifications and updates
• Respond to your comments, questions, and customer service requests
• Monitor and analyze trends, usage, and activities in connection with our services
• Detect, investigate, and prevent fraudulent or unauthorized activities
• Personalize and improve your experience on our Platform`
    },
    {
      title: '3. Code Analysis and Data Handling',
      content: `When you submit code for analysis:
• Your code is processed in secure, isolated environments
• Code is temporarily stored during analysis and deleted afterward
• We do not use your proprietary code to train AI models
• Analysis results are stored securely with your account
• You retain full ownership of all intellectual property in your code
• Aggregate, anonymized data may be used to improve our detection algorithms`
    },
    {
      title: '4. Information Sharing',
      content: `We do not sell, trade, or otherwise transfer your personal information to third parties except in the following circumstances:
• With your explicit consent
• To comply with legal obligations or valid legal requests
• To protect our rights, privacy, safety, or property
• In connection with a merger, acquisition, or sale of assets
• With service providers who assist in our operations (bound by confidentiality)
We may share aggregated, anonymized data that cannot identify you for research or analytics purposes.`
    },
    {
      title: '5. Data Security',
      content: `We implement industry-standard security measures to protect your information:
• Encryption in transit using TLS 1.3
• Encryption at rest using AES-256
• Regular security audits and penetration testing
• Access controls and authentication requirements
• Secure cloud infrastructure with major providers
• Employee security training and access policies
No security measure is 100% secure, and we cannot guarantee absolute security.`
    },
    {
      title: '6. Data Retention',
      content: `We retain your information for as long as your account is active or as needed to provide services:
• Account data: retained until account deletion
• Analysis results: retained for 90 days after account deletion
• Usage logs: retained for 30 days
• Support correspondence: retained for 2 years
You may request deletion of your data at any time. We will honor such requests within 30 days.`
    },
    {
      title: '7. Cookies and Tracking',
      content: `We use cookies and similar tracking technologies:
• Essential Cookies: Required for basic platform functionality
• Analytics Cookies: Help us understand how you use our platform
• Preference Cookies: Remember your settings and preferences
• Security Cookies: Detect authentication abuses and threats
You can control cookies through your browser settings. Disabling cookies may affect platform functionality.`
    },
    {
      title: '8. Your Rights',
      content: `Depending on your location, you may have the right to:
• Access your personal information
• Correct inaccurate personal information
• Delete your personal information
• Restrict or object to processing of your data
• Data portability
• Withdraw consent
• File a complaint with a data protection authority
To exercise these rights, contact privacy@project-eric.com.`
    },
    {
      title: "9. Children's Privacy",
      content: `Our Platform is not intended for children under 16 years of age. We do not knowingly collect personal information from children under 16. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately at privacy@project-eric.com.`
    },
    {
      title: '10. International Data Transfers',
      content: `Your information may be transferred to and processed in countries other than your country of residence. These countries may have different data protection laws. We ensure appropriate safeguards are in place for such transfers, including Standard Contractual Clauses and compliance with applicable data protection frameworks.`
    },
    {
      title: '11. Third-Party Services',
      content: `Our Platform may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to review the privacy policies of any third-party services you access through our Platform.`
    },
    {
      title: '12. Changes to This Policy',
      content: `We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the "Last updated" date. We may also send you an email notification for significant changes. Your continued use of the Platform after changes constitutes acceptance of the updated policy.`
    },
    {
      title: '13. Contact Us',
      content: `If you have any questions about this Privacy Policy or our data practices, please contact us:
• Email: privacy@project-eric.com
• Address: Project Eric, Data Protection Team
• Response Time: We aim to respond within 48 hours`
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-slate-600 dark:text-slate-300 dark:text-slate-300 hover:text-slate-900 dark:text-slate-100 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">Back</span>
            </button>
            <Link to="/" className="flex items-center gap-2">
              <img src="/Logo.png" alt="Logo" className="w-8 h-8" />
              <span className="font-bold text-slate-900 dark:text-slate-100">Project Eric</span>
            </Link>
            <div className="w-20" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`max-w-4xl mx-auto px-4 sm:px-6 py-12 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-6 shadow-xl shadow-emerald-500/30">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            Privacy Policy
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Your privacy matters to us. Learn how we collect, use, and protect your data while providing top-tier security scanning services.
          </p>
          <div className="flex items-center justify-center gap-4 mt-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <Lock className="w-4 h-4" />
              Last updated: September 19, 2026
            </span>
          </div>
        </div>

        {/* Quick Overview Cards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {[
            { 
              icon: Database, 
              title: 'Data We Collect', 
              desc: 'Account, usage, and code you submit for analysis',
              color: 'emerald'
            },
            { 
              icon: Lock, 
              title: 'How We Protect', 
              desc: 'AES-256 encryption, secure infrastructure, audits',
              color: 'teal'
            },
            { 
              icon: Eye, 
              title: 'Your Control', 
              desc: 'Access, delete, and manage your data anytime',
              color: 'cyan'
            },
          ].map((item, index) => (
            <div 
              key={index} 
              className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 text-center hover:shadow-lg transition-all ${
                item.color === 'emerald' ? 'hover:border-emerald-200' : 
                item.color === 'teal' ? 'hover:border-teal-200' : 
                'hover:border-cyan-200'
              }`}
            >
              <div className={`w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center ${
                item.color === 'emerald' ? 'bg-emerald-100' : 
                item.color === 'teal' ? 'bg-teal-100' : 
                'bg-cyan-100'
              }`}>
                <item.icon className={`w-7 h-7 ${
                  item.color === 'emerald' ? 'text-emerald-600' : 
                  item.color === 'teal' ? 'text-teal-600' : 
                  'text-cyan-600'
                }`} />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2">{item.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Privacy Highlights */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-700 to-teal-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Your Privacy Commitments
            </h2>
          </div>
          <div className="p-6 space-y-4">
            {[
              { title: 'We never sell your data', desc: 'Your personal information is never sold to third parties or advertisers.', check: true },
              { title: 'Your code stays yours', desc: 'You retain full ownership of all code submitted for analysis.', check: true },
              { title: 'No AI training on your code', desc: 'Your proprietary code is never used to train AI models.', check: true },
              { title: 'Secure by design', desc: 'We implement enterprise-grade security measures throughout our infrastructure.', check: true },
              { title: 'Transparent processing', desc: 'Clear explanations of how your data is collected and used.', check: true },
              { title: 'Quick response to requests', desc: 'We respond to privacy requests within 48 hours.', check: true },
            ].map((item, index) => (
              <div key={index} className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 hover:bg-emerald-50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Data Categories */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-8 overflow-hidden">
          <div className="bg-slate-800 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Database className="w-5 h-5" />
              Types of Data We Handle
            </h2>
          </div>
          <div className="p-6 grid sm:grid-cols-2 gap-4">
            {[
              { icon: User, title: 'Personal Information', items: ['Name and email', 'Account credentials', 'Profile data'] },
              { icon: Server, title: 'Technical Data', items: ['Device information', 'Browser type', 'IP address'] },
              { icon: FileText, title: 'Code & Analysis', items: ['Submitted code', 'Analysis results', 'Project metadata'] },
              { icon: Cookie, title: 'Usage Data', items: ['Pages visited', 'Features used', 'Time spent'] },
            ].map((item, index) => (
              <div key={index} className="p-4 rounded-xl border border-slate-100 hover:border-teal-200 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-teal-600" />
                  </div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                </div>
                <ul className="space-y-1">
                  {item.items.map((subItem, i) => (
                    <li key={i} className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                      {subItem}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Full Policy */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="bg-slate-800 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Complete Privacy Policy
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {sections.map((section, index) => (
              <div key={index} className="p-0">
                <button
                  onClick={() => toggleSection(index)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{section.title}</span>
                  {expandedSections[index] ? (
                    <ChevronUp className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                  )}
                </button>
                {expandedSections[index] && (
                  <div className="px-6 pb-5 text-slate-600 dark:text-slate-300 leading-relaxed">
                    {section.content.split('\n').map((paragraph, pIndex) => (
                      paragraph.startsWith('•') ? (
                        <div key={pIndex} className="flex gap-2 mt-2">
                          <span className="text-teal-500 mt-1">•</span>
                          <span>{paragraph.substring(1).trim()}</span>
                        </div>
                      ) : (
                        <p key={pIndex} className={pIndex > 0 ? 'mt-3' : ''}>{paragraph}</p>
                      )
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact CTA */}
        <div className="mt-8 bg-gradient-to-r from-emerald-700 to-teal-700 rounded-2xl p-8 text-center text-white">
          <Mail className="w-12 h-12 mx-auto mb-4 opacity-90" />
          <h3 className="text-xl font-bold mb-2">Questions about your privacy?</h3>
          <p className="text-emerald-100 mb-4">Our privacy team is dedicated to protecting your data and answering your questions.</p>
          <a 
            href="mailto:privacy@project-eric.com" 
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-teal-600 rounded-xl font-semibold hover:bg-emerald-50 transition-colors"
          >
            <Mail className="w-5 h-5" />
            Contact Privacy Team
          </a>
        </div>

        {/* Footer Navigation */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
          <span>View also:</span>
          <div className="flex gap-4">
            <Link to="/terms-of-service" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
              Terms of Service
            </Link>
            <span className="text-slate-300">|</span>
            <Link to="/forgot-password" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
              Reset Password
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
