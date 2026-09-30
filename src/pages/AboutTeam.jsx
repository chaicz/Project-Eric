import React, { useState, useEffect } from 'react';
import {
  Users,
  Code2,
  Zap,
  Shield,
  Heart,
  Github,
  Linkedin,
  Mail,
  ExternalLink,
  Coffee,
  Rocket,
  Award,
  Globe
} from 'lucide-react';
import PageTip from '../components/PageTip';

const AboutTeam = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const teamMembers = [
    {
      id: 1,
      name: 'Alex Chen',
      role: 'Lead Developer',
      bio: 'Full-stack architect with 8+ years experience in security-focused web development. Passionate about building tools that help developers write safer code.',
      avatar: 'AC',
      skills: ['React', 'Node.js', 'Security', 'Cloud Architecture'],
      github: '#',
      linkedin: '#'
    },
    {
      id: 2,
      name: 'Sarah Kim',
      role: 'Security Engineer',
      bio: 'Former penetration tester turned developer. Specializes in threat modeling, vulnerability assessment, and security automation.',
      avatar: 'SK',
      skills: ['Python', 'Security Auditing', 'Penetration Testing', 'OWASP'],
      github: '#',
      linkedin: '#'
    },
    {
      id: 3,
      name: 'Marcus Johnson',
      role: 'UI/UX Designer',
      bio: 'Creating intuitive interfaces that make security tools accessible to everyone. Believes great security shouldn\'t require a PhD.',
      avatar: 'MJ',
      skills: ['Figma', 'Design Systems', 'Accessibility', 'Motion Design'],
      github: '#',
      linkedin: '#'
    },
    {
      id: 4,
      name: 'Priya Patel',
      role: 'Backend Engineer',
      bio: 'Database architect and API specialist focused on scalable, secure backend systems. Champion of clean code and thorough testing.',
      avatar: 'PP',
      skills: ['PostgreSQL', 'Docker', 'Kubernetes', 'GraphQL'],
      github: '#',
      linkedin: '#'
    }
  ];

  const techStack = [
    { name: 'React', description: 'Modern frontend framework', icon: Code2 },
    { name: 'Node.js', description: 'Server-side runtime', icon: Zap },
    { name: 'Security First', description: 'Built with security in mind', icon: Shield },
    { name: 'Cloud Native', description: 'Scalable architecture', icon: Rocket },
  ];

  const values = [
    {
      title: 'Security by Design',
      description: 'We believe security should be built into every layer of the application, not bolted on as an afterthought.',
      icon: Shield
    },
    {
      title: 'Developer Experience',
      description: 'Great tools should make developers more productive, not create friction. We obsess over usability.',
      icon: Coffee
    },
    {
      title: 'Open Collaboration',
      description: 'We believe in the power of community. Security improves when we share knowledge openly.',
      icon: Globe
    },
    {
      title: 'Continuous Improvement',
      description: 'The threat landscape evolves daily. Our platform evolves with it through constant iteration.',
      icon: Award
    }
  ];

  return (
    <div className={`p-6 lg:p-8 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Page Tip — first-time guidance */}
      <PageTip
        pageId="about-team"
        variant="info"
        title="Meet the team behind Project Eric"
        body="We're a small group of security engineers and designers building tools we wish we had. Have feedback or a feature idea? Use the buttons below to reach out."
      />
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">About Developer Team</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Meet the minds behind Project Eric</p>
      </div>

      {/* Mission Section */}
      <div className="minimal-card p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Rocket className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Our Mission</h2>
            <p className="text-slate-600 leading-relaxed">
              Project Eric was born from a simple belief: every developer deserves powerful security tools 
              that are intuitive, efficient, and built with modern workflows in mind. We're here to make 
              security accessible to teams of all sizes, from solo developers to enterprise organizations.
            </p>
          </div>
        </div>
      </div>

      {/* Tech Stack */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Built With</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {techStack.map((tech) => (
            <div key={tech.name} className="minimal-card p-4 text-center hover:border-violet-200 transition-colors">
              <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-violet-50 flex items-center justify-center">
                <tech.icon className="w-5 h-5 text-violet-600" />
              </div>
              <h3 className="font-medium text-slate-900 dark:text-slate-100 text-sm">{tech.name}</h3>
              <p className="text-xs text-slate-500 mt-1">{tech.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Values */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Our Values</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {values.map((value) => (
            <div key={value.title} className="minimal-card p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <value.icon className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{value.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{value.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Team Members */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Meet the Team</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {teamMembers.map((member) => (
            <div key={member.id} className="minimal-card p-6 hover:border-violet-200 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                  {member.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{member.name}</h3>
                  <p className="text-sm text-violet-600 font-medium">{member.role}</p>
                  <p className="text-sm text-slate-600 mt-2 leading-relaxed">{member.bio}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {member.skills.map((skill) => (
                      <span 
                        key={skill} 
                        className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <a 
                      href={member.github}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="GitHub"
                    >
                      <Github className="w-5 h-5" />
                    </a>
                    <a 
                      href={member.linkedin}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="LinkedIn"
                    >
                      <Linkedin className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact / Feedback Section */}
      <div className="minimal-card p-6 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40 border-violet-100 dark:border-violet-900/50">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Heart className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">We'd Love Your Feedback</h2>
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              Have ideas for features? Found a bug? Want to contribute? Reach out to us — 
              your feedback helps make Project Eric better for everyone.
            </p>
            <div className="flex flex-wrap gap-3">
              <a 
                href="mailto:team@project-eric.com"
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 rounded-xl hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
              >
                <Mail className="w-4 h-4" />
                Contact Us
              </a>
              <a 
                href="https://github.com/project-eric"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <Github className="w-4 h-4" />
                View on GitHub
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutTeam;
