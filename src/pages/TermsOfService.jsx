import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Scale, 
  FileText, 
  CheckCircle, 
  Shield,
  Clock,
  AlertTriangle,
  Users,
  Globe,
  Lock,
  ChevronDown,
  ChevronUp,
  Mail
} from 'lucide-react';

const TermsOfService = () => {
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
      title: '1. Acceptance of Terms',
      content: `By accessing and using Project Eric ("the Platform"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by these terms, please do not use this service. Your continued use of the Platform constitutes acceptance of these Terms of Service.`
    },
    {
      title: '2. Description of Service',
      content: `Project Eric is a security-first development platform that provides code scanning, vulnerability analysis, secure coding assistance, and related services. The Platform is designed to help developers identify and address security vulnerabilities in their code through automated analysis and AI-powered recommendations.`
    },
    {
      title: '3. User Accounts and Registration',
      content: `To access certain features of the Platform, you must create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account. You must be at least 18 years old to create an account.`
    },
    {
      title: '4. Acceptable Use',
      content: `You agree to use the Platform only for lawful purposes and in accordance with these Terms. You shall not:
• Use the Platform in any way that violates applicable laws or regulations
• Attempt to gain unauthorized access to any systems or networks
• Use the Platform to develop malware, viruses, or other harmful code
• Interfere with the integrity or performance of the Platform
• Reverse engineer, decompile, or disassemble any part of the Platform
• Use the Platform to scan or analyze systems without authorization`
    },
    {
      title: '5. Security Scanning Guidelines',
      content: `When using our security scanning features:
• You must only scan code and systems you own or have permission to scan
• You acknowledge that scanning may produce false positives and negatives
• Analysis results are recommendations, not legal advice
• You are responsible for validating and acting on scan results appropriately
• Abuse of scanning services may result in service termination`
    },
    {
      title: '6. Intellectual Property Rights',
      content: `The Platform and its original content, features, and functionality are owned by Project Eric and are protected by international copyright, trademark, patent, and other intellectual property laws. You retain ownership of any code you submit for analysis. By submitting code, you grant us a limited license to process and analyze it for the purposes of providing the service.`
    },
    {
      title: '7. Data Privacy and Security',
      content: `We take data privacy seriously. Please review our Privacy Policy for detailed information about how we collect, use, and protect your data. By using the Platform, you consent to our data practices as described in the Privacy Policy. We implement industry-standard security measures to protect your information.`
    },
    {
      title: '8. Third-Party Services',
      content: `The Platform may include links to third-party websites, services, or resources. We do not endorse or assume responsibility for any third-party content, privacy practices, or services. Your interactions with third-party services are governed by their respective terms and privacy policies.`
    },
    {
      title: '9. Service Availability',
      content: `We strive to provide uninterrupted access to the Platform, but we do not guarantee continuous availability. The Platform may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control. We reserve the right to modify, suspend, or discontinue the service at any time with reasonable notice.`
    },
    {
      title: '10. Disclaimer of Warranties',
      content: `THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE. SECURITY SCANNING RESULTS ARE ANALYTICAL TOOLS AND SHOULD NOT BE CONSIDERED GUARANTEES OF SECURITY.`
    },
    {
      title: '11. Limitation of Liability',
      content: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, PROJECT ERIC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE PLATFORM. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU (IF ANY) FOR ACCESSING THE PLATFORM.`
    },
    {
      title: '12. Indemnification',
      content: `You agree to indemnify, defend, and hold harmless Project Eric and its affiliates, licensors, and service providers from and against any claims, liabilities, damages, judgments, awards, losses, costs, and expenses arising out of or relating to your violation of these Terms or your use of the Platform.`
    },
    {
      title: '13. Modifications to Terms',
      content: `We reserve the right to modify these Terms of Service at any time. We will notify users of significant changes via email or prominent notice on the Platform. Continued use of the Platform after changes constitutes acceptance of the modified terms. The date of the last update will be indicated at the top of this page.`
    },
    {
      title: '14. Governing Law',
      content: `These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Project Eric operates, without regard to its conflict of law provisions. Any disputes shall be resolved in the courts of that jurisdiction.`
    },
    {
      title: '15. Contact Information',
      content: `If you have any questions about these Terms of Service, please contact us at legal@project-eric.com or through the support channels available on our Platform.`
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">Back</span>
            </button>
            <Link to="/" className="flex items-center gap-2">
              <img src="/Logo.png" alt="Logo" className="w-8 h-8" />
              <span className="font-bold text-slate-900">Project Eric</span>
            </Link>
            <div className="w-20" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`max-w-4xl mx-auto px-4 sm:px-6 py-12 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 mb-6 shadow-xl shadow-blue-500/30">
            <Scale className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
            Terms of Service
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Please read these terms carefully before using Project Eric. They govern your use of our security-first development platform.
          </p>
          <div className="flex items-center justify-center gap-4 mt-6 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Last updated: September 19, 2026
            </span>
          </div>
        </div>

        {/* Quick Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Key Points Summary
            </h2>
          </div>
          <div className="p-6 grid sm:grid-cols-2 gap-4">
            {[
              { icon: CheckCircle, title: 'Your Data Ownership', desc: 'You retain ownership of all code you submit' },
              { icon: Lock, title: 'Security First', desc: 'Only scan systems you have permission to scan' },
              { icon: Globe, title: 'Lawful Use Only', desc: 'Use our platform responsibly and legally' },
              { icon: AlertTriangle, title: 'Scan Responsibly', desc: 'Follow acceptable use guidelines' },
              { icon: Users, title: 'Account Security', desc: 'Keep your credentials safe and secure' },
              { icon: FileText, title: 'Stay Informed', desc: 'Check for updates to these terms' },
            ].map((item, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 hover:bg-blue-50 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                  <item.icon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">{item.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Full Terms */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Complete Terms of Service
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {sections.map((section, index) => (
              <div key={index} className="p-0">
                <button
                  onClick={() => toggleSection(index)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="font-semibold text-slate-900">{section.title}</span>
                  {expandedSections[index] ? (
                    <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  )}
                </button>
                {expandedSections[index] && (
                  <div className="px-6 pb-5 text-slate-600 leading-relaxed">
                    {section.content.split('\n').map((paragraph, pIndex) => (
                      paragraph.startsWith('•') ? (
                        <div key={pIndex} className="flex gap-2 mt-2">
                          <span className="text-blue-500 mt-1">•</span>
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
        <div className="mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-center text-white">
          <Mail className="w-12 h-12 mx-auto mb-4 opacity-90" />
          <h3 className="text-xl font-bold mb-2">Questions about our terms?</h3>
          <p className="text-blue-100 mb-4">Our legal team is here to help with any questions you may have.</p>
          <a 
            href="mailto:legal@project-eric.com" 
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-600 rounded-xl font-semibold hover:bg-blue-50 transition-colors"
          >
            <Mail className="w-5 h-5" />
            Contact Legal Team
          </a>
        </div>

        {/* Footer Navigation */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-slate-500">
          <span>View also:</span>
          <div className="flex gap-4">
            <Link to="/privacy-policy" className="text-blue-600 hover:text-blue-700 font-medium">
              Privacy Policy
            </Link>
            <span className="text-slate-300">|</span>
            <Link to="/forgot-password" className="text-blue-600 hover:text-blue-700 font-medium">
              Reset Password
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TermsOfService;
