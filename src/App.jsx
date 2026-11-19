import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import emailjs from '@emailjs/browser';
import './App.css';

// --- EMAILJS CONFIGURATION ---
const EMAILJS_SERVICE_ID = 'INSERT_HERE';
const EMAILJS_TEMPLATE_ID = 'INSERT_HERE';
const EMAILJS_PUBLIC_KEY = 'INSERT_HERE';

// --- GIA REQUIRED DOCUMENTS ---
const GIA_DOCS_BY_PROJECT_TYPE = {
  'R&D Project': [
    'DOST FORM 4.A - Detailed R&D Project Proposal'
  ],
  'R&D Program': [
    'DOST FORM 3 - Detailed R&D Program Proposal for Basic/Applied Research',
    'DOST FORM 4.A - Detailed R&D Project Proposal'
  ],
  'Non-R&D Project': [
    'DOST FORM 4.B - Detailed Non-R&D Project Proposal'
  ]
};

const GIA_COUNTERPART_DOC = {
  'SUC / HEI / LGU / RDI': 'Letter of Commitment for 15% Counterpart Fund (in cash and/or in kind)',
  'NGO / NPO / PO / Private Entity': 'Proof / Letter of Commitment for 20% Equity (in cash and/or in kind)'
};

const GIA_NGO_LEGAL_DOCS = [
  'SEC / DTI / CDA Registration Certificate',
  "Valid Mayor's / Business Permit",
  'Audited Financial Statements (last 3 years)',
  'Board Resolution authorizing the project and signatory',
  'Sworn Affidavit of Non-Relation to DOST Officials'
];

const GIA_COMMON_DOCS = [
  'DOST FORM 5 - Project Work Plan',
  'DOST FORM 6 - Project Line-Item Budget',
  'DOST FORM 7 - Clearance Form for Project Leaders with Previously Funded Project',
  'Detailed breakdown of the required fund assistance per item of expense',
  'Monthly Cash Program',
  'Gender and Development (GAD) Score Sheet',
  'Curriculum Vitae or Personal Data Sheet of Project Leader and other co-researchers/implementers',
  "Approval from the institution's Ethics Review Board (human subjects) / FPIC / Bureau of Animal Industry (animal subjects)",
  'Clearance from DOST Biosafety Committee (for proposals involving GMOs)',
  'Official Communication / Endorsement from the Head of Institution'
];

// --- SETUP TWO-PHASE REQUIRED DOCUMENTS (DOST-IX ALIGNED) ---
const SETUP_PHASE1_DOCS = [
  'Letter of Intent (LOI) addressed to the DOST Regional Director',
  'Accomplished DOST TNA Form 1 (Application for Technology Needs Assessment)',
  'DTI / SEC / CDA Certificate of Registration',
  "Valid Mayor's / Business Permit and other LGU/Government Licenses (e.g., BIR)",
  'Financial Statements for the past 3 years (Audited or BIR-filed / In-house)',
  'Valid Government-Issued ID of Owner / Authorized Signatory',
  "Board Resolution / Secretary's Certificate authorizing the application and signatory (for Corporations/Cooperatives)"
];

const SETUP_PHASE2_DOCS = [
  'Accomplished SETUP Form 1 (Project Proposal / Enterprise Profile)',
  'Projected Financial Statements (3 to 5 years)',
  'Three (3) Supplier Quotations / Pro-forma Invoices with Technical Specifications for requested equipment',
  'Sworn Affidavit of Non-Relation to DOST Officials',
  'FDA License to Operate (LTO) / Sanitary Permit / DENR ECC or CNC (if applicable to industry)'
];

// Conditional GIA & SETUP documents that applicants can explicitly mark as "N/A"
const CONDITIONAL_DOCS = new Set([
  'DOST FORM 7 - Clearance Form for Project Leaders with Previously Funded Project',
  "Approval from the institution's Ethics Review Board (human subjects) / FPIC / Bureau of Animal Industry (animal subjects)",
  'Clearance from DOST Biosafety Committee (for proposals involving GMOs)',
  "Board Resolution / Secretary's Certificate authorizing the application and signatory (for Corporations/Cooperatives)",
  'FDA License to Operate (LTO) / Sanitary Permit / DENR ECC or CNC (if applicable to industry)'
]);

const PROGRAM_INFO = {
  GIA: "Grants-in-Aid (GIA) provides funding for research, development, and technology transfer initiatives that address community or industry needs.",
  SETUP: "Small Enterprise Technology Upgrading Program (SETUP) assists MSMEs in adopting technological innovations to improve operations and productivity. Applications are accepted year-round."
};

function App() {
  const [session, setSession] = useState(null);

  // Auth Inputs
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [businessNameInput, setBusinessNameInput] = useState('');
  const [contactNumberInput, setContactNumberInput] = useState('');
  const [businessAddressInput, setBusinessAddressInput] = useState('');

  // User Profile & Menu States
  const [role, setRole] = useState('applicant');
  const [userProfile, setUserProfile] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editContactInput, setEditContactInput] = useState('');
  const [editAddressInput, setEditAddressInput] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Navigation States
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedApp, setSelectedApp] = useState(null);
  const [reviewerTab, setReviewerTab] = useState('pending');

  // Application States
  const [appData, setAppData] = useState(null);
  const [giaProjectType, setGiaProjectType] = useState('R&D Project');
  const [giaAgencyType, setGiaAgencyType] = useState('SUC / HEI / LGU / RDI');
  const [uploadedDocs, setUploadedDocs] = useState({});
  const [uploadingDoc, setUploadingDoc] = useState(null);

  // Applicant Reschedule States
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [proposedDateInput, setProposedDateInput] = useState('');
  const [rescheduleReasonInput, setRescheduleReasonInput] = useState('');

  // GIA Deadline Only (id 1 = GIA; SETUP has no deadline)
  const [giaDeadline, setGiaDeadline] = useState(null);
  const [newGiaDeadlineInput, setNewGiaDeadlineInput] = useState('');

  // Reviewer States
  const [allApps, setAllApps] = useState([]);
  const [commentFile, setCommentFile] = useState(null);
  const [siteVisitDateInput, setSiteVisitDateInput] = useState('');
  const [reviewerAltDateInput, setReviewerAltDateInput] = useState('');

  const isGiaClosed = giaDeadline ? new Date() > giaDeadline : false;

  const getRequiredDocs = (program, status = 'draft', projectType = giaProjectType, agencyType = giaAgencyType) => {
    if (program === 'GIA') {
      const specificDocs = GIA_DOCS_BY_PROJECT_TYPE[projectType] || GIA_DOCS_BY_PROJECT_TYPE['R&D Project'];
      const counterpartDoc = GIA_COUNTERPART_DOC[agencyType] || GIA_COUNTERPART_DOC['SUC / HEI / LGU / RDI'];
      const legalDocs = agencyType === 'NGO / NPO / PO / Private Entity' ? GIA_NGO_LEGAL_DOCS : [];
      return [...specificDocs, ...GIA_COMMON_DOCS, counterpartDoc, ...legalDocs];
    }
    if (program === 'SETUP') {
      return status === 'phase2_draft' ? SETUP_PHASE2_DOCS : SETUP_PHASE1_DOCS;
    }
    return [];
  };

  const getFileNameFromUrl = (url, docType) => {
    if (!url || url === 'N/A') return '';
    const fullFileName = decodeURIComponent(url.split('/').pop());
    const prefix = `${docType.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 35)}_`;
    const withoutTimestamp = fullFileName.replace(/^\d+_/, '');
    return withoutTimestamp.startsWith(prefix) ? withoutTimestamp.slice(prefix.length) : withoutTimestamp;
  };

  const notifyReviewers = async (program, statusMessage) => {
    const { data: reviewers } = await supabase
      .from('users')
      .select('email, assigned_program')
      .eq('role', 'reviewer');

    if (!reviewers || reviewers.length === 0) return;

    const targetReviewers = reviewers.filter(r => {
      if (!r.email) return false;
      const assigned = (r.assigned_program || 'ALL').trim().toUpperCase();
      return assigned === 'ALL' || assigned === program.toUpperCase();
    });

    await Promise.all(
      targetReviewers.map(reviewer =>
        emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          { status: statusMessage, to_email: reviewer.email },
          EMAILJS_PUBLIC_KEY
        ).catch(err => console.error(`Failed to email reviewer ${reviewer.email}:`, err))
      )
    );
  };

  useEffect(() => {
    fetchGiaDeadline();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
        setEmailInput('');
        setPasswordInput('');
        setBusinessNameInput('');
        setContactNumberInput('');
        setBusinessAddressInput('');
      } else {
        setUserProfile(null);
        setMenuOpen(false);
        setSelectedProgram(null);
        setSelectedApp(null);
        setAppData(null);
        setUploadedDocs({});
        setSiteVisitDateInput('');
        setReviewerAltDateInput('');
        setShowRescheduleForm(false);
        setProposedDateInput('');
        setRescheduleReasonInput('');
        setEmailInput('');
        setPasswordInput('');
        setBusinessNameInput('');
        setContactNumberInput('');
        setBusinessAddressInput('');
      }
    });
  }, []);

  useEffect(() => {
    if (session && role === 'applicant' && selectedProgram) {
      fetchApplicantProgramData(session.user.id, selectedProgram);
    }
  }, [selectedProgram, session, role]);

  const fetchGiaDeadline = async () => {
    const { data } = await supabase.from('system_settings').select('deadline').eq('id', 1).maybeSingle();
    if (data?.deadline) setGiaDeadline(new Date(data.deadline));
  };

  const fetchUserProfile = async (userId) => {
    const { data: userData } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (userData) {
      setUserProfile(userData);
      setEditContactInput(userData.contact_number || '');
      setEditAddressInput(userData.business_address || '');
      if (userData.role === 'reviewer') {
        setRole('reviewer');
        fetchAllApps();
      } else {
        setRole('applicant');
      }
    } else {
      setRole('applicant');
    }
  };

  const fetchApplicantProgramData = async (userId, program) => {
    setAppData(null);
    setUploadedDocs({});
    setGiaProjectType('R&D Project');
    setGiaAgencyType('SUC / HEI / LGU / RDI');
    setShowRescheduleForm(false);

    const { data: application, error } = await supabase
      .from('applications')
      .select('*')
      .eq('applicant_id', userId)
      .eq('program_type', program)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      alert("Error loading application: " + error.message);
      return;
    }

    if (application) {
      setAppData(application);
      setUploadedDocs(application.document_urls || {});
      if (program === 'GIA') {
        if (application.gia_project_type) setGiaProjectType(application.gia_project_type);
        if (application.gia_agency_type) setGiaAgencyType(application.gia_agency_type);
      }
    }
  };

  const fetchAllApps = async () => {
    const { data } = await supabase
      .from('applications')
      .select('*, users(email, business_name, contact_number, business_address)')
      .in('status', ['pending', 'phase2_draft', 'phase2_pending', 'accepted', 'rejected'])
      .order('created_at', { ascending: false });
    if (data) setAllApps(data);
  };

  // --- AUTHENTICATION ---
  const handleSignUp = async (e) => {
    e.preventDefault();
    if (
      !emailInput.trim() ||
      !passwordInput.trim() ||
      !businessNameInput.trim() ||
      !contactNumberInput.trim() ||
      !businessAddressInput.trim()
    ) {
      return alert("Please fill out Email, Password, Business Name, Contact Number, and Business/Plant Address.");
    }

    const { data, error } = await supabase.auth.signUp({
      email: emailInput.trim(),
      password: passwordInput
    });
    if (error) return alert(error.message);

    if (data.user) {
      const { error: profileError } = await supabase.from('users').upsert([{
        id: data.user.id,
        email: emailInput.trim(),
        role: 'applicant',
        business_name: businessNameInput.trim(),
        contact_number: contactNumberInput.trim(),
        business_address: businessAddressInput.trim()
      }]);
      if (profileError) {
        alert("Account created, but profile failed to save: " + profileError.message);
      } else {
        fetchUserProfile(data.user.id);
      }
    }
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: emailInput, password: passwordInput });
    if (error) alert(error.message);
  };

  const handleForgotPassword = async () => {
    if (!emailInput) return alert("Please type your email address in the box first.");
    const { error } = await supabase.auth.resetPasswordForEmail(emailInput);
    if (error) alert(error.message);
    else alert("Password reset link sent to your email!");
  };

  // --- PROFILE UPDATE ---
  const handleSaveProfile = async () => {
    if (!session) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from('users')
      .update({
        contact_number: editContactInput,
        business_address: editAddressInput
      })
      .eq('id', session.user.id);

    setSavingProfile(false);
    if (error) {
      alert("Failed to update info: " + error.message);
    } else {
      setUserProfile(prev => ({
        ...prev,
        contact_number: editContactInput,
        business_address: editAddressInput
      }));
      alert("Account information updated!");
    }
  };

  // --- APPLICANT ACTIONS ---
  const getActiveDraft = async () => {
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .eq('applicant_id', session.user.id)
      .eq('program_type', selectedProgram)
      .in('status', ['draft', 'phase2_draft'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data, error };
  };

  const saveDraftDocs = async (
    updatedDocs,
    projectTypeOverride = giaProjectType,
    agencyTypeOverride = giaAgencyType
  ) => {
    const { data: currentDraft, error: fetchError } = await getActiveDraft();
    if (fetchError) {
      alert("Database Read Failed: " + fetchError.message);
      return false;
    }

    if (currentDraft) {
      const { error: updateError } = await supabase
        .from('applications')
        .update({
          document_urls: updatedDocs,
          gia_project_type: selectedProgram === 'GIA' ? projectTypeOverride : null,
          gia_agency_type: selectedProgram === 'GIA' ? agencyTypeOverride : null
        })
        .eq('id', currentDraft.id);

      if (updateError) {
        alert("Draft Update Failed: " + updateError.message);
        return false;
      }
      setAppData({
        ...currentDraft,
        document_urls: updatedDocs,
        gia_project_type: projectTypeOverride,
        gia_agency_type: agencyTypeOverride
      });
    } else {
      const { data: newApp, error: insertError } = await supabase
        .from('applications')
        .insert([{
          applicant_id: session.user.id,
          program_type: selectedProgram,
          gia_project_type: selectedProgram === 'GIA' ? projectTypeOverride : null,
          gia_agency_type: selectedProgram === 'GIA' ? agencyTypeOverride : null,
          status: 'draft',
          document_urls: updatedDocs,
          applicant_email: session.user.email
        }])
        .select()
        .single();

      if (insertError) {
        alert("Draft Save Failed: " + insertError.message);
        return false;
      }
      setAppData(newApp);
    }

    setUploadedDocs(updatedDocs);
    return true;
  };

  const handleGiaConfigChange = async (newProjectType, newAgencyType) => {
    setGiaProjectType(newProjectType);
    setGiaAgencyType(newAgencyType);

    const validDocs = new Set(getRequiredDocs('GIA', 'draft', newProjectType, newAgencyType));
    const cleanedDocs = {};
    Object.entries(uploadedDocs).forEach(([docName, val]) => {
      if (validDocs.has(docName)) cleanedDocs[docName] = val;
    });

    setUploadedDocs(cleanedDocs);
    if (appData && appData.status === 'draft') {
      await saveDraftDocs(cleanedDocs, newProjectType, newAgencyType);
    }
  };

  const handleDocUpload = async (docType, file) => {
    if (!file || !selectedProgram) return;
    setUploadingDoc(docType);

    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const docSlug = docType.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 35);
    const filePath = `${session.user.id}/${selectedProgram}/${Date.now()}_${docSlug}_${cleanFileName}`;

    const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file, { upsert: true });
    if (uploadError) {
      setUploadingDoc(null);
      return alert("Storage Upload Failed: " + uploadError.message);
    }

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);
    const { data: currentDraft } = await getActiveDraft();
    const freshDocs = currentDraft?.document_urls ? { ...currentDraft.document_urls } : { ...uploadedDocs };
    freshDocs[docType] = urlData.publicUrl;

    await saveDraftDocs(freshDocs);
    setUploadingDoc(null);
  };

  const handleToggleNA = async (docType, isChecked) => {
    const { data: currentDraft } = await getActiveDraft();
    const freshDocs = currentDraft?.document_urls ? { ...currentDraft.document_urls } : { ...uploadedDocs };

    if (isChecked) {
      freshDocs[docType] = 'N/A';
    } else {
      delete freshDocs[docType];
    }
    await saveDraftDocs(freshDocs);
  };

  const handleDocDelete = async (docType) => {
    const { data: currentDraft } = await getActiveDraft();
    const freshDocs = currentDraft?.document_urls ? { ...currentDraft.document_urls } : { ...uploadedDocs };
    delete freshDocs[docType];

    if (currentDraft) {
      await saveDraftDocs(freshDocs);
    } else {
      setUploadedDocs(freshDocs);
    }
  };

  const handleFinalSubmit = async () => {
    if (!appData || (appData.status !== 'draft' && appData.status !== 'phase2_draft')) {
      return alert("No active draft found to submit.");
    }

    const nextStatus = appData.status === 'phase2_draft' ? 'phase2_pending' : 'pending';
    const { error } = await supabase.from('applications').update({ status: nextStatus }).eq('id', appData.id);
    if (error) return alert("Submission failed: " + error.message);

    setAppData({ ...appData, status: nextStatus });

    const businessName = userProfile?.business_name || session.user.email;
    const phaseLabel = selectedProgram === 'SETUP'
      ? (nextStatus === 'phase2_pending' ? 'SETUP (Phase 2 - Post-Site Visit)' : 'SETUP (Phase 1 - Pre-Site Visit)')
      : 'GIA';

    await notifyReviewers(
      selectedProgram,
      `NEW ${phaseLabel} SUBMISSION from ${businessName} (Pending Review)`
    );

    alert(`${selectedProgram} application submitted for review!`);
  };

  const handleSubmitAgain = async () => {
    if (selectedProgram === 'GIA' && isGiaClosed) {
      return alert("The GIA deadline has passed. You can no longer submit a new GIA application.");
    }

    const { data: newApp, error } = await supabase
      .from('applications')
      .insert([{
        applicant_id: session.user.id,
        program_type: selectedProgram,
        gia_project_type: selectedProgram === 'GIA' ? 'R&D Project' : null,
        gia_agency_type: selectedProgram === 'GIA' ? 'SUC / HEI / LGU / RDI' : null,
        status: 'draft',
        document_urls: {},
        applicant_email: session.user.email
      }])
      .select()
      .single();

    if (error) return alert("Could not start new application: " + error.message);

    setAppData(newApp);
    setUploadedDocs({});
    setGiaProjectType('R&D Project');
    setGiaAgencyType('SUC / HEI / LGU / RDI');
  };

  // --- APPLICANT SITE VISIT CONFIRMATION / RESCHEDULE ---
  const handleConfirmSiteVisit = async () => {
    if (!appData) return;
    const { error } = await supabase
      .from('applications')
      .update({ site_visit_status: 'confirmed' })
      .eq('id', appData.id);

    if (error) return alert("Failed to confirm site visit: " + error.message);

    setAppData({ ...appData, site_visit_status: 'confirmed' });
    setShowRescheduleForm(false);

    const businessName = userProfile?.business_name || session.user.email;
    const visitStr = appData.site_visit_date ? new Date(appData.site_visit_date).toLocaleString() : 'scheduled date';
    await notifyReviewers(
      'SETUP',
      `SITE VISIT CONFIRMED: ${businessName} confirmed their TNA site visit for ${visitStr}.`
    );

    alert("Site visit schedule confirmed! Reviewers have been notified.");
  };

  const handleRequestReschedule = async () => {
    if (!proposedDateInput) return alert("Please select your preferred new date and time.");
    const isoDate = new Date(proposedDateInput).toISOString();

    const { error } = await supabase
      .from('applications')
      .update({
        site_visit_status: 'reschedule_requested',
        proposed_site_visit_date: isoDate,
        reschedule_reason: rescheduleReasonInput || 'No reason provided'
      })
      .eq('id', appData.id);

    if (error) return alert("Failed to request reschedule: " + error.message);

    setAppData({
      ...appData,
      site_visit_status: 'reschedule_requested',
      proposed_site_visit_date: isoDate,
      reschedule_reason: rescheduleReasonInput || 'No reason provided'
    });
    setShowRescheduleForm(false);
    setProposedDateInput('');
    setRescheduleReasonInput('');

    const businessName = userProfile?.business_name || session.user.email;
    await notifyReviewers(
      'SETUP',
      `SITE VISIT RESCHEDULE REQUEST from ${businessName} — Proposed: ${new Date(isoDate).toLocaleString()} (Reason: ${rescheduleReasonInput || 'None'})`
    );

    alert("Reschedule request sent! DOST reviewers will review and confirm the new date.");
  };

  // --- REVIEWER ACTIONS ---
  const handleUpdateGiaDeadline = async () => {
    if (!newGiaDeadlineInput) return;
    const { error } = await supabase.from('system_settings').upsert({ id: 1, deadline: newGiaDeadlineInput });
    if (error) return alert("Failed to update GIA deadline: " + error.message);

    setGiaDeadline(new Date(newGiaDeadlineInput));
    alert("GIA deadline updated!");
  };

  const handleReviewerUpdateSiteVisit = async (app, newIsoDate) => {
    if (!newIsoDate) return alert("Please select a valid date and time.");
    const { error } = await supabase
      .from('applications')
      .update({
        site_visit_date: newIsoDate,
        site_visit_status: 'confirmed',
        proposed_site_visit_date: null,
        reschedule_reason: null
      })
      .eq('id', app.id);

    if (error) return alert("Failed to update site visit date: " + error.message);

    const formattedVisit = new Date(newIsoDate).toLocaleString();
    emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        status: `SETUP SITE VISIT RESCHEDULED & CONFIRMED - Your new TNA site visit is set for ${formattedVisit}.`,
        to_email: app.applicant_email
      },
      EMAILJS_PUBLIC_KEY
    ).catch(err => console.error("EmailJS error:", err));

    setSelectedApp({
      ...app,
      site_visit_date: newIsoDate,
      site_visit_status: 'confirmed',
      proposed_site_visit_date: null,
      reschedule_reason: null
    });
    setReviewerAltDateInput('');
    fetchAllApps();
    alert(`Site visit updated to ${formattedVisit} and applicant notified!`);
  };

  const handleDecision = async (app, decision) => {
    const isApprovingSetupPhase1 = app.program_type === 'SETUP' && decision === 'phase2_draft';

    if (isApprovingSetupPhase1 && !siteVisitDateInput) {
      return alert("STOP: You must set a Site Visit date and time before approving Phase 1.");
    }
    if (!commentFile) {
      return alert("STOP: You must upload a reviewer comment PDF before deciding.");
    }

    setUploadingDoc('feedback');

    const cleanFileName = commentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const phaseTag = app.program_type === 'SETUP'
      ? (app.status === 'phase2_pending' ? 'phase2' : 'phase1')
      : 'gia';
    const filePath = `reviews/${app.id}/${phaseTag}_${Date.now()}_${cleanFileName}`;

    const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, commentFile, { upsert: true });
    if (uploadError) {
      setUploadingDoc(null);
      return alert("Feedback upload failed: " + uploadError.message);
    }

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);

    const updatePayload = { status: decision };
    if (app.program_type === 'SETUP') {
      if (app.status === 'phase2_pending') {
        updatePayload.phase2_comments_url = urlData.publicUrl;
      } else {
        updatePayload.phase1_comments_url = urlData.publicUrl;
      }
      if (isApprovingSetupPhase1) {
        updatePayload.site_visit_date = new Date(siteVisitDateInput).toISOString();
        updatePayload.site_visit_status = 'pending_confirmation';
      }
    } else {
      updatePayload.reviewer_comments_url = urlData.publicUrl;
    }

    const { error: updateError } = await supabase.from('applications').update(updatePayload).eq('id', app.id);
    if (updateError) {
      setUploadingDoc(null);
      return alert("Database update failed: " + updateError.message);
    }

    let emailStatusText = `${app.program_type} - ${decision.toUpperCase()}`;
    if (isApprovingSetupPhase1) {
      const formattedVisit = new Date(siteVisitDateInput).toLocaleString();
      emailStatusText = `SETUP PHASE 1 ACCEPTED - Your Technology Needs Assessment (TNA) site visit is proposed for ${formattedVisit}. Please log in to your portal to confirm this schedule (or request a reschedule) and upload your Phase 2 documents.`;
    } else if (app.program_type === 'SETUP' && decision === 'accepted') {
      emailStatusText = "SETUP FINAL APPLICATION ACCEPTED - Congratulations! Please log in to your portal to download the Phase 2 reviewer feedback PDF and next steps.";
    } else if (decision === 'rejected') {
      emailStatusText = `${app.program_type} APPLICATION REJECTED - Please log in to your portal to download the reviewer feedback PDF. You may revise and submit a new application.`;
    }

    emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      { status: emailStatusText, to_email: app.applicant_email },
      EMAILJS_PUBLIC_KEY
    ).then(() => {
      setUploadingDoc(null);
      setCommentFile(null);
      setSiteVisitDateInput('');
      alert("Decision saved and applicant notified via email!");
      setSelectedApp(null);
      fetchAllApps();
    }).catch((err) => {
      setUploadingDoc(null);
      setSiteVisitDateInput('');
      alert("Decision saved, but EmailJS failed: " + JSON.stringify(err));
      setSelectedApp(null);
      fetchAllApps();
    });
  };

  // --- REUSABLE FEEDBACK PDF BLOCK ---
  const renderFeedbackLinks = (app) => {
    const hasPhase1 = Boolean(app?.phase1_comments_url);
    const hasPhase2 = Boolean(app?.phase2_comments_url);
    const hasLegacyOrGia = Boolean(app?.reviewer_comments_url);

    if (!hasPhase1 && !hasPhase2 && !hasLegacyOrGia) return null;

    return (
      <div className="status-banner status-warning" style={{ marginTop: "16px" }}>
        <h4 style={{ marginTop: 0, marginBottom: "8px" }}>Reviewer Feedback & Notes</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {hasPhase1 && (
            <a href={app.phase1_comments_url} target="_blank" rel="noreferrer" className="doc-link">
              📥 Download Phase 1 Feedback / Site Visit Instructions (PDF)
            </a>
          )}
          {hasPhase2 && (
            <a href={app.phase2_comments_url} target="_blank" rel="noreferrer" className="doc-link">
              📥 Download Phase 2 Final Evaluation Feedback (PDF)
            </a>
          )}
          {hasLegacyOrGia && (
            <a href={app.reviewer_comments_url} target="_blank" rel="noreferrer" className="doc-link">
              📥 Download Reviewer Feedback (PDF)
            </a>
          )}
        </div>
      </div>
    );
  };

  // --- REUSABLE APPLICANT HEADER WITH HAMBURGER MENU (☰) ---
  const renderApplicantHeader = (showBackButton = false) => {
    const displayName = userProfile?.business_name || session?.user?.email;
    return (
      <div className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {showBackButton && (
            <button onClick={() => setSelectedProgram(null)} className="btn btn-secondary">
              ← Back
            </button>
          )}
          <span className="header-title">{displayName}</span>
        </div>

        <div>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="btn btn-secondary"
            style={{ fontSize: "18px", padding: "6px 12px" }}
            title="Account Menu"
          >
            ☰
          </button>

          {menuOpen && (
            <div className="menu-dropdown">
              <h4 style={{ marginTop: 0, marginBottom: "12px" }}>Account Information</h4>

              <label style={{ fontSize: "12px", fontWeight: 600 }}>Business Name (Locked)</label>
              <input type="text" value={userProfile?.business_name || ""} disabled className="input-field" />

              <label style={{ fontSize: "12px", fontWeight: 600 }}>Email</label>
              <input type="text" value={session?.user?.email || ""} disabled className="input-field" />

              <label style={{ fontSize: "12px", fontWeight: 600 }}>Contact Number</label>
              <input
                type="text"
                value={editContactInput}
                onChange={(e) => setEditContactInput(e.target.value)}
                className="input-field"
              />

              <label style={{ fontSize: "12px", fontWeight: 600 }}>Business / Plant Address</label>
              <textarea
                rows={2}
                value={editAddressInput}
                onChange={(e) => setEditAddressInput(e.target.value)}
                placeholder="Street, Barangay, City/Municipality"
                className="input-field"
              />

              <button onClick={handleSaveProfile} disabled={savingProfile} className="btn btn-primary btn-full" style={{ marginBottom: "10px" }}>
                {savingProfile ? "Saving..." : "Save Account Info"}
              </button>

              <button onClick={() => supabase.auth.signOut()} className="btn btn-danger btn-full">
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ==========================================
  // PAGE 1: HOMEPAGE (LOGIN + SERVICE INFO)
  // ==========================================
  if (!session) {
    return (
      <div className="container">
        <div className="row" style={{ marginBottom: "20px" }}>
          <div className={`col status-banner ${isGiaClosed ? "status-closed" : "status-open"}`} style={{ textAlign: "center", marginBottom: 0 }}>
            <strong>GIA: {isGiaClosed ? "CLOSED" : "OPEN"}</strong>
            <div style={{ fontSize: "13px", marginTop: "4px" }}>
              Deadline: {giaDeadline ? giaDeadline.toLocaleString() : "Loading..."}
            </div>
          </div>

          <div className="col status-banner status-open" style={{ textAlign: "center", marginBottom: 0 }}>
            <strong>SETUP: OPEN YEAR-ROUND</strong>
            <div style={{ fontSize: "13px", marginTop: "4px" }}>
              Accepting applications anytime (No Deadline)
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col">
            <h1 style={{ marginTop: 0, color: "#0038A8" }}>DOST Proposal Portal</h1>
            <p style={{ color: "#475569", marginBottom: "20px" }}>
              Log in or create an applicant account to submit proposals for GIA or SETUP.
            </p>

            <div className="card card-gia">
              <h3 style={{ marginTop: 0 }}>1. GIA (Grants-in-Aid)</h3>
              <p style={{ marginBottom: 0, color: "#475569" }}>{PROGRAM_INFO.GIA}</p>
            </div>

            <div className="card card-setup">
              <h3 style={{ marginTop: 0 }}>2. SETUP</h3>
              <p style={{ marginBottom: 0, color: "#475569" }}>{PROGRAM_INFO.SETUP}</p>
            </div>
          </div>

          <div className="col">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Log In</h3>
              <input type="email" placeholder="Email" value={emailInput} onChange={e => setEmailInput(e.target.value)} className="input-field" />
              <input type="password" placeholder="Password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} className="input-field" />
              <button onClick={handleLogin} className="btn btn-primary btn-full" style={{ marginBottom: "8px" }}>Log In</button>
              <button onClick={handleForgotPassword} className="btn btn-secondary btn-full">Forgot Password?</button>
            </div>

            <form onSubmit={handleSignUp} className="card">
              <h3 style={{ marginTop: 0 }}>Create Applicant Account</h3>
              <input
                type="text"
                placeholder="Business / Organization Name *"
                value={businessNameInput}
                onChange={e => setBusinessNameInput(e.target.value)}
                required
                className="input-field"
              />
              <p style={{ fontSize: "12px", color: "#dc2626", marginTop: "-6px", marginBottom: "12px", fontWeight: 600 }}>
                * Business name cannot be edited after creating the account.
              </p>
              <input
                type="text"
                placeholder="Contact Number *"
                value={contactNumberInput}
                onChange={e => setContactNumberInput(e.target.value)}
                required
                className="input-field"
              />
              <input
                type="text"
                placeholder="Business / Plant Address (Street, Brgy, City) *"
                value={businessAddressInput}
                onChange={e => setBusinessAddressInput(e.target.value)}
                required
                className="input-field"
              />
              <p style={{ fontSize: "12px", color: "#64748b", marginTop: 0 }}>
                * Enter your email and password in the Log In box above first.
              </p>
              <button type="submit" className="btn btn-setup btn-full">Create Account</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // APPLICANT VIEWS
  // ==========================================
  if (role === 'applicant') {
    if (!selectedProgram) {
      return (
        <div className="container">
          {renderApplicantHeader(false)}
          <h2 style={{ marginTop: 0 }}>Select a Service to Apply</h2>

          <div className="row">
            <div className="col card card-gia">
              <div className={`status-banner ${isGiaClosed ? "status-closed" : "status-open"}`}>
                <strong>Status: {isGiaClosed ? "CLOSED" : "OPEN"}</strong><br />
                Deadline: {giaDeadline?.toLocaleString()}
              </div>
              <h2 style={{ marginTop: 0 }}>GIA</h2>
              <p style={{ color: "#475569" }}>{PROGRAM_INFO.GIA}</p>
              <p style={{ fontSize: "13px", color: "#64748b" }}>
                <strong>Categories:</strong> R&D Project / R&D Program / Non-R&D Project
              </p>
              <button onClick={() => setSelectedProgram('GIA')} className="btn btn-primary btn-full">
                Open GIA Portal
              </button>
            </div>

            <div className="col card card-setup">
              <div className="status-banner status-open">
                <strong>Status: OPEN YEAR-ROUND</strong><br />
                2-Phase Process (Pre-Site Visit → Post-Site Visit)
              </div>
              <h2 style={{ marginTop: 0 }}>SETUP</h2>
              <p style={{ color: "#475569" }}>{PROGRAM_INFO.SETUP}</p>
              <p style={{ fontSize: "13px", color: "#64748b" }}>
                <strong>Process:</strong> Phase 1 Eligibility → Site Visit (TNA) → Phase 2 Proposal
              </p>
              <button onClick={() => setSelectedProgram('SETUP')} className="btn btn-setup btn-full">
                Open SETUP Portal
              </button>
            </div>
          </div>
        </div>
      );
    }

    const status = appData?.status || 'unstarted';
    const requiredDocs = getRequiredDocs(selectedProgram, status, giaProjectType, giaAgencyType);
    const allDocsUploaded = requiredDocs.every(doc => Boolean(uploadedDocs[doc]));
    const isBlockedByDeadline = selectedProgram === 'GIA' && isGiaClosed && (status === 'unstarted' || status === 'draft');
    const isUploadingPhase = !isBlockedByDeadline && (status === 'unstarted' || status === 'draft' || status === 'phase2_draft');

    return (
      <div className="container">
        {renderApplicantHeader(true)}
        <h2 style={{ marginTop: 0 }}>{selectedProgram} Application Portal</h2>

        {selectedProgram === 'GIA' ? (
          <div className={`status-banner ${isGiaClosed ? "status-closed" : "status-open"}`}>
            <strong>GIA Status: {isGiaClosed ? "CLOSED FOR NEW SUBMISSIONS" : "OPEN"}</strong> | Deadline: {giaDeadline?.toLocaleString()}
          </div>
        ) : (
          <div className="status-banner status-open">
            <strong>SETUP Status: OPEN YEAR-ROUND</strong> | {status === 'phase2_draft' || status === 'phase2_pending' ? 'Phase 2: Post-Site Visit Proposal' : 'Phase 1: Pre-Site Visit Screening'}
          </div>
        )}

        {isBlockedByDeadline && (
          <div className="status-banner status-closed">
            <h3 style={{ marginTop: 0 }}>Application Closed</h3>
            <p style={{ marginBottom: 0 }}>The GIA deadline has passed. You can no longer submit a new GIA application.</p>
          </div>
        )}

        {/* Phase 2 Approved Banner with Two-Way Site Visit Confirmation / Reschedule */}
        {selectedProgram === 'SETUP' && status === 'phase2_draft' && (
          <div className="card card-setup">
            <h3 style={{ marginTop: 0, color: "#0f766e" }}>✓ Phase 1 Approved — Technology Needs Assessment (TNA) Site Visit</h3>

            {appData?.site_visit_date && (
              <div className="doc-row">
                <div style={{ marginBottom: "6px" }}>
                  <strong>📅 Scheduled TNA Site Visit:</strong> {new Date(appData.site_visit_date).toLocaleString()}
                </div>
                <div style={{ fontSize: "13px", color: "#475569", marginBottom: "12px" }}>
                  <strong>Site Location:</strong> {userProfile?.business_address || "Not set (update in ☰ menu)"}
                </div>

                {appData.site_visit_status === 'confirmed' && (
                  <span className="badge badge-setup">✓ Schedule Confirmed</span>
                )}

                {appData.site_visit_status === 'reschedule_requested' && (
                  <div className="status-banner status-warning" style={{ marginBottom: 0 }}>
                    <strong>⏳ Reschedule Requested:</strong> Waiting for DOST reviewer to confirm your proposed date ({appData.proposed_site_visit_date ? new Date(appData.proposed_site_visit_date).toLocaleString() : ''}).
                  </div>
                )}

                {(!appData.site_visit_status || appData.site_visit_status === 'pending_confirmation') && (
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button onClick={handleConfirmSiteVisit} className="btn btn-setup">✓ Confirm Schedule</button>
                    <button onClick={() => setShowRescheduleForm(!showRescheduleForm)} className="btn btn-secondary">Request Reschedule</button>
                  </div>
                )}

                {showRescheduleForm && (
                  <div className="card" style={{ marginTop: "14px", marginBottom: 0 }}>
                    <label style={{ display: "block", fontWeight: 600, fontSize: "13px", marginBottom: "6px" }}>
                      Preferred New Date & Time (Mon–Fri, 8:00 AM–5:00 PM):
                    </label>
                    <input
                      type="datetime-local"
                      value={proposedDateInput}
                      onChange={(e) => setProposedDateInput(e.target.value)}
                      className="input-field"
                    />
                    <input
                      type="text"
                      placeholder="Brief reason for rescheduling (optional)"
                      value={rescheduleReasonInput}
                      onChange={(e) => setRescheduleReasonInput(e.target.value)}
                      className="input-field"
                    />
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button onClick={handleRequestReschedule} className="btn btn-primary">Submit Request</button>
                      <button onClick={() => setShowRescheduleForm(false)} className="btn btn-secondary">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <p style={{ marginBottom: 0, fontSize: "14px", color: "#475569" }}>
              After your TNA site visit, upload the required <strong>Phase 2 documents</strong> below to complete your SETUP application.
            </p>
            {renderFeedbackLinks(appData)}
          </div>
        )}

        {/* Upload Checklist */}
        {isUploadingPhase && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0 }}>
                {selectedProgram === 'SETUP'
                  ? (status === 'phase2_draft' ? 'Phase 2: Required Post-Site Visit Documents' : 'Phase 1: Required Pre-Site Visit Documents')
                  : 'Required GIA Documents'}
              </h3>
              {(status === 'draft' || status === 'phase2_draft') && (
                <span className="badge badge-setup">✓ Saved as Draft</span>
              )}
            </div>

            {selectedProgram === 'GIA' && (
              <div className="row status-banner status-info" style={{ marginBottom: "20px" }}>
                <div className="col" style={{ minWidth: "220px" }}>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: "6px", fontSize: "13px" }}>
                    Project Type:
                  </label>
                  <select
                    value={giaProjectType}
                    onChange={(e) => handleGiaConfigChange(e.target.value, giaAgencyType)}
                    className="select-field"
                    style={{ marginBottom: 0 }}
                  >
                    <option value="R&D Project">R&D Project (Form 4.A)</option>
                    <option value="R&D Program">R&D Program (Form 3 + 4.A)</option>
                    <option value="Non-R&D Project">Non-R&D Project (Form 4.B)</option>
                  </select>
                </div>

                <div className="col" style={{ minWidth: "220px" }}>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: "6px", fontSize: "13px" }}>
                    Implementing Agency Type:
                  </label>
                  <select
                    value={giaAgencyType}
                    onChange={(e) => handleGiaConfigChange(giaProjectType, e.target.value)}
                    className="select-field"
                    style={{ marginBottom: 0 }}
                  >
                    <option value="SUC / HEI / LGU / RDI">SUC / HEI / LGU / RDI (15% Counterpart)</option>
                    <option value="NGO / NPO / PO / Private Entity">NGO / NPO / PO / Private Entity (20% Equity + Legal Docs)</option>
                  </select>
                </div>
              </div>
            )}

            {requiredDocs.map(doc => {
              const isConditional = CONDITIONAL_DOCS.has(doc);
              const isMarkedNA = uploadedDocs[doc] === 'N/A';

              return (
                <div key={doc} className="doc-row">
                  <div style={{ marginBottom: "8px" }}>
                    <strong>{doc}</strong>
                    {isConditional && <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "6px" }}>(If applicable)</span>}
                  </div>

                  {isMarkedNA ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className="badge" style={{ backgroundColor: "#e2e8f0", color: "#334155" }}>Marked as N/A</span>
                      <button onClick={() => handleToggleNA(doc, false)} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "12px" }}>
                        Undo N/A
                      </button>
                    </div>
                  ) : uploadedDocs[doc] ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ color: "#475569", fontSize: "13px", fontStyle: "italic" }}>
                        {getFileNameFromUrl(uploadedDocs[doc], doc)}
                      </span>
                      <a href={uploadedDocs[doc]} target="_blank" rel="noreferrer" className="doc-link">📄 View PDF</a>
                      <button onClick={() => handleDocDelete(doc)} className="btn btn-danger" style={{ padding: "6px 12px", fontSize: "12px" }}>Remove</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                      <input type="file" accept="application/pdf" onChange={(e) => handleDocUpload(doc, e.target.files[0])} disabled={uploadingDoc === doc} />
                      {uploadingDoc === doc && <span style={{ color: "#0038A8", fontSize: "13px" }}>Uploading & saving draft...</span>}
                      {isConditional && (
                        <label style={{ fontSize: "13px", color: "#475569", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={(e) => handleToggleNA(doc, e.target.checked)}
                            style={{ marginRight: "6px" }}
                          />
                          Not Applicable (N/A)
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={handleFinalSubmit}
              disabled={!allDocsUploaded}
              className={`btn btn-full ${selectedProgram === 'SETUP' ? 'btn-setup' : 'btn-primary'}`}
              style={{ marginTop: "12px", padding: "14px" }}
            >
              {allDocsUploaded
                ? (selectedProgram === 'SETUP'
                    ? (status === 'phase2_draft' ? 'Submit Final Phase 2 SETUP Application' : 'Submit Phase 1 Documents for Screening')
                    : 'Submit Final GIA Application')
                : "Complete all required documents to unlock submit"}
            </button>
          </div>
        )}

        {/* Submitted / Pending / Final Result View */}
        {(status === 'pending' || status === 'phase2_pending' || status === 'accepted' || status === 'rejected') && (
          <div className={`card ${selectedProgram === 'SETUP' ? 'card-setup' : 'card-gia'}`}>
            <h3 style={{ marginTop: 0 }}>
              {selectedProgram} Application Status:{' '}
              {status === 'phase2_pending'
                ? 'PHASE 2 PENDING FINAL REVIEW'
                : (selectedProgram === 'SETUP' && status === 'pending' ? 'PHASE 1 PENDING REVIEW' : status.toUpperCase())}
            </h3>

            {selectedProgram === 'SETUP' && appData?.site_visit_date && (
              <div className="status-banner status-open">
                <strong>📅 Scheduled TNA Site Visit:</strong> {new Date(appData.site_visit_date).toLocaleString()}
              </div>
            )}

            {(status === 'pending' || status === 'phase2_pending') && (
              <div className="status-banner status-info">
                {selectedProgram === 'SETUP' && status === 'pending' ? (
                  <p style={{ margin: 0 }}>
                    <strong>What happens next:</strong> Your Phase 1 documents are under review. Our DOST regional team may contact you via your registered email or phone number for clarifications. Once approved, you will receive an email with your proposed <strong>TNA site visit</strong> schedule and Phase 2 uploads will unlock here.
                  </p>
                ) : (
                  <p style={{ margin: 0 }}>
                    <strong>What happens next:</strong> Your complete application is under evaluation. Our team may contact you via email or phone if clarifications are needed. You will be notified by email once a final decision is made.
                  </p>
                )}
              </div>
            )}

            {selectedProgram === 'GIA' && (
              <p style={{ fontSize: "14px", color: "#475569" }}>
                <strong>Project Type:</strong> {appData?.gia_project_type || 'R&D Project'} |{' '}
                <strong>Agency Type:</strong> {appData?.gia_agency_type || 'SUC / HEI / LGU / RDI'}
              </p>
            )}

            <h4>Your Submitted Documents</h4>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
              {Object.entries(uploadedDocs).map(([docName, url]) => (
                url === 'N/A' ? (
                  <span key={docName} className="doc-link" style={{ backgroundColor: "#f1f5f9", color: "#64748b" }}>
                    {docName}: <strong>N/A</strong>
                  </span>
                ) : (
                  <a key={docName} href={url} target="_blank" rel="noreferrer" className="doc-link">
                    📄 View {docName}
                  </a>
                )
              ))}
            </div>

            {renderFeedbackLinks(appData)}

            {(status === 'accepted' || status === 'rejected') && (
              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
                <button
                  onClick={handleSubmitAgain}
                  disabled={selectedProgram === 'GIA' && isGiaClosed}
                  className="btn btn-primary"
                >
                  {(selectedProgram === 'GIA' && isGiaClosed)
                    ? "GIA Closed (Cannot Submit Again)"
                    : `Submit Another ${selectedProgram} Application`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // REVIEWER VIEWS
  // ==========================================
  if (role === 'reviewer') {
    if (selectedApp) {
      const isSetupPhase1Pending = selectedApp.program_type === 'SETUP' && selectedApp.status === 'pending';
      const isSetupPhase2Pending = selectedApp.program_type === 'SETUP' && selectedApp.status === 'phase2_pending';
      const isGiaPending = selectedApp.program_type === 'GIA' && selectedApp.status === 'pending';
      const needsDecision = isSetupPhase1Pending || isSetupPhase2Pending || isGiaPending;

      return (
        <div className="container">
          <button
            onClick={() => { setSelectedApp(null); setCommentFile(null); setSiteVisitDateInput(''); setReviewerAltDateInput(''); }}
            className="btn btn-secondary"
            style={{ marginBottom: "20px" }}
          >
            ← Back to Reviewer Dashboard
          </button>

          <div className={`card ${selectedApp.program_type === 'SETUP' ? 'card-setup' : 'card-gia'}`}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
              <span className={`badge ${selectedApp.program_type === 'GIA' ? 'badge-gia' : 'badge-setup'}`}>
                {selectedApp.program_type}
              </span>
              {selectedApp.program_type === 'SETUP' && (
                <span className="badge" style={{ backgroundColor: "#e2e8f0", color: "#1e293b" }}>
                  {selectedApp.status === 'pending' ? 'Phase 1 (Pre-Site Visit)' : selectedApp.status === 'phase2_draft' ? 'Phase 2 (Awaiting Docs)' : selectedApp.status === 'phase2_pending' ? 'Phase 2 (Post-Site Visit)' : 'Completed'}
                </span>
              )}
              {selectedApp.program_type === 'GIA' && selectedApp.gia_project_type && (
                <span className="badge" style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>{selectedApp.gia_project_type}</span>
              )}
              {selectedApp.program_type === 'GIA' && selectedApp.gia_agency_type && (
                <span className="badge" style={{ backgroundColor: "#f3e8ff", color: "#6b21a8" }}>{selectedApp.gia_agency_type}</span>
              )}
              <span style={{ fontWeight: 700, fontSize: "13px", marginLeft: "auto" }}>Status: {selectedApp.status.toUpperCase()}</span>
            </div>

            <h2 style={{ marginTop: 0, marginBottom: "6px" }}>{selectedApp.users?.business_name || "Unknown Business"}</h2>
            <p style={{ margin: "4px 0", fontSize: "14px", color: "#475569" }}>
              <strong>Email:</strong> {selectedApp.applicant_email} | <strong>Contact:</strong> {selectedApp.users?.contact_number || "N/A"}
            </p>
            <p style={{ margin: "4px 0 16px 0", fontSize: "14px", color: "#475569" }}>
              <strong>Business / Plant Address:</strong> {selectedApp.users?.business_address || "Not provided"}
            </p>

            {/* Site Visit Status & Reschedule Handling Box */}
            {selectedApp.site_visit_date && (
              <div className={`status-banner ${selectedApp.site_visit_status === 'reschedule_requested' ? 'status-warning' : 'status-open'}`}>
                <div>
                  <strong>📅 Scheduled TNA Site Visit:</strong> {new Date(selectedApp.site_visit_date).toLocaleString()}{' '}
                  <strong>
                    ({selectedApp.site_visit_status === 'confirmed' ? 'CONFIRMED BY APPLICANT' : selectedApp.site_visit_status === 'reschedule_requested' ? 'RESCHEDULE REQUESTED' : 'AWAITING APPLICANT CONFIRMATION'})
                  </strong>
                </div>

                {selectedApp.site_visit_status === 'reschedule_requested' && (
                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #fcd34d" }}>
                    <p style={{ margin: "0 0 6px 0" }}>
                      <strong>Applicant's Proposed Date:</strong> {selectedApp.proposed_site_visit_date ? new Date(selectedApp.proposed_site_visit_date).toLocaleString() : 'N/A'}
                    </p>
                    <p style={{ margin: "0 0 12px 0" }}>
                      <strong>Reason:</strong> {selectedApp.reschedule_reason || 'None provided'}
                    </p>
                    <button
                      onClick={() => handleReviewerUpdateSiteVisit(selectedApp, selectedApp.proposed_site_visit_date)}
                      className="btn btn-setup"
                      style={{ marginBottom: "12px" }}
                    >
                      ✓ Approve Proposed Date
                    </button>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "13px" }}>Or set an alternative date:</span>
                      <input
                        type="datetime-local"
                        value={reviewerAltDateInput}
                        onChange={(e) => setReviewerAltDateInput(e.target.value)}
                        className="input-field"
                        style={{ width: "auto", marginBottom: 0 }}
                      />
                      <button
                        onClick={() => reviewerAltDateInput && handleReviewerUpdateSiteVisit(selectedApp, new Date(reviewerAltDateInput).toISOString())}
                        className="btn btn-primary"
                      >
                        Set Alternative Date
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "20px 0" }} />
            <h3>Submitted Documents</h3>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
              {Object.entries(selectedApp.document_urls || {}).map(([docName, url]) => (
                url === 'N/A' ? (
                  <span key={docName} className="doc-link" style={{ backgroundColor: "#f1f5f9", color: "#64748b" }}>
                    {docName}: <strong>N/A</strong>
                  </span>
                ) : (
                  <a key={docName} href={url} target="_blank" rel="noreferrer" className="doc-link">
                    📄 View {docName}
                  </a>
                )
              ))}
            </div>

            {renderFeedbackLinks(selectedApp)}

            {needsDecision ? (
              <div className="doc-row" style={{ marginTop: "20px" }}>
                <h4 style={{ marginTop: 0 }}>
                  {isSetupPhase1Pending
                    ? 'Phase 1 Screening Decision (Pre-Site Visit)'
                    : isSetupPhase2Pending
                      ? 'Phase 2 Final Decision (Post-Site Visit)'
                      : 'Review Decision'}
                </h4>

                {isSetupPhase1Pending && (
                  <div className="status-banner status-open">
                    <label style={{ display: "block", fontWeight: 600, marginBottom: "6px" }}>
                      📅 Schedule TNA Site Visit (Required to Approve Phase 1):
                    </label>
                    <input
                      type="datetime-local"
                      value={siteVisitDateInput}
                      onChange={(e) => setSiteVisitDateInput(e.target.value)}
                      className="input-field"
                      style={{ width: "auto", marginBottom: 0 }}
                    />
                  </div>
                )}

                <p style={{ color: "#dc2626", fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
                  * Reviewer Comment / Instructions PDF is required
                </p>
                <input type="file" accept="application/pdf" onChange={(e) => setCommentFile(e.target.files[0])} />
                {uploadingDoc === 'feedback' && <span style={{ color: "#0038A8", marginLeft: "10px" }}>Processing...</span>}

                <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
                  {isSetupPhase1Pending ? (
                    <>
                      <button onClick={() => handleDecision(selectedApp, 'phase2_draft')} disabled={uploadingDoc === 'feedback'} className="btn btn-setup">
                        Approve & Schedule Site Visit (Unlock Phase 2)
                      </button>
                      <button onClick={() => handleDecision(selectedApp, 'rejected')} disabled={uploadingDoc === 'feedback'} className="btn btn-danger">
                        Reject Application
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleDecision(selectedApp, 'accepted')} disabled={uploadingDoc === 'feedback'} className="btn btn-setup">
                        {isSetupPhase2Pending ? 'Final Accept SETUP Proposal' : 'Accept Proposal'}
                      </button>
                      <button onClick={() => handleDecision(selectedApp, 'rejected')} disabled={uploadingDoc === 'feedback'} className="btn btn-danger">
                        {isSetupPhase2Pending ? 'Final Reject SETUP Proposal' : 'Reject Proposal'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="status-banner status-info" style={{ marginTop: "20px", marginBottom: 0 }}>
                <strong>
                  {selectedApp.status === 'phase2_draft'
                    ? 'Awaiting Applicant Phase 2 Documents (Site Visit / TNA Stage)'
                    : `Archived Decision: ${selectedApp.status.toUpperCase()}`}
                </strong>
              </div>
            )}
          </div>
        </div>
      );
    }

    const pendingCount = allApps.filter(a => a.status === 'pending' || a.status === 'phase2_pending').length;
    const phase2Count = allApps.filter(a => a.status === 'phase2_draft').length;
    const acceptedCount = allApps.filter(a => a.status === 'accepted').length;
    const rejectedCount = allApps.filter(a => a.status === 'rejected').length;

    const filteredApps = allApps.filter(app => {
      if (reviewerTab === 'pending') return app.status === 'pending' || app.status === 'phase2_pending';
      return app.status === reviewerTab;
    });

    const giaApps = filteredApps.filter(app => app.program_type === 'GIA');
    const setupApps = filteredApps.filter(app => app.program_type === 'SETUP');

    return (
      <div className="container">
        <div className="header-bar">
          <span className="header-title">DOST Reviewer Portal</span>
          <button onClick={() => supabase.auth.signOut()} className="btn btn-danger">Log Out</button>
        </div>

        <div className="card card-gia">
          <h3 style={{ marginTop: 0, color: "#0038A8" }}>GIA Application Deadline</h3>
          <p style={{ fontSize: "14px", color: "#475569", marginTop: 0 }}>
            Current GIA Deadline: <strong>{giaDeadline?.toLocaleString()}</strong> (SETUP is open year-round with no deadline)
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="datetime-local"
              step="1"
              value={newGiaDeadlineInput}
              onChange={e => setNewGiaDeadlineInput(e.target.value)}
              className="input-field"
              style={{ width: "auto", marginBottom: 0 }}
            />
            <button onClick={handleUpdateGiaDeadline} className="btn btn-primary">Set GIA Deadline</button>
          </div>
        </div>

        <div className="tab-bar">
          <button onClick={() => setReviewerTab('pending')} className={`btn ${reviewerTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}>
            Pending Review ({pendingCount})
          </button>
          <button onClick={() => setReviewerTab('phase2_draft')} className={`btn ${reviewerTab === 'phase2_draft' ? 'btn-setup' : 'btn-secondary'}`}>
            SETUP Site Visit / Phase 2 ({phase2Count})
          </button>
          <button onClick={() => setReviewerTab('accepted')} className={`btn ${reviewerTab === 'accepted' ? 'btn-setup' : 'btn-secondary'}`}>
            Accepted Archive ({acceptedCount})
          </button>
          <button onClick={() => setReviewerTab('rejected')} className={`btn ${reviewerTab === 'rejected' ? 'btn-danger' : 'btn-secondary'}`}>
            Rejected Archive ({rejectedCount})
          </button>
        </div>

        <div className="row">
          <div className="col card card-gia">
            <h2 style={{ marginTop: 0, color: "#0038A8" }}>GIA Applications ({giaApps.length})</h2>
            {giaApps.length === 0 && <p style={{ color: "#64748b" }}>No GIA applications in this folder.</p>}
            {giaApps.map(app => (
              <div key={app.id} onClick={() => setSelectedApp(app)} className="app-list-item">
                <strong>📁 {app.users?.business_name || "Unknown Business"}</strong>
                {app.gia_project_type && <span style={{ fontSize: "12px", marginLeft: "6px", color: "#0038A8" }}>({app.gia_project_type})</span>}
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{app.applicant_email}</div>
              </div>
            ))}
          </div>

          <div className="col card card-setup">
            <h2 style={{ marginTop: 0, color: "#0d9488" }}>SETUP Applications ({setupApps.length})</h2>
            {setupApps.length === 0 && <p style={{ color: "#64748b" }}>No SETUP applications in this folder.</p>}
            {setupApps.map(app => (
              <div
                key={app.id}
                onClick={() => setSelectedApp(app)}
                className="app-list-item"
                style={app.site_visit_status === 'reschedule_requested' ? { borderColor: "#f59e0b", borderWidth: "2px" } : undefined}
              >
                <strong>📁 {app.users?.business_name || "Unknown Business"}</strong>
                {app.status === 'pending' && <span style={{ fontSize: "12px", marginLeft: "6px", color: "#0038A8", fontWeight: 600 }}>(Phase 1)</span>}
                {app.status === 'phase2_pending' && <span style={{ fontSize: "12px", marginLeft: "6px", color: "#d97706", fontWeight: 600 }}>(Phase 2)</span>}
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{app.applicant_email}</div>
                {app.site_visit_date && (
                  <div style={{ fontSize: "12px", color: app.site_visit_status === 'reschedule_requested' ? "#b45309" : "#0f766e", marginTop: "4px", fontWeight: 600 }}>
                    📅 Site Visit: {new Date(app.site_visit_date).toLocaleString()}
                    {app.site_visit_status === 'reschedule_requested' && ' — ⚠ RESCHEDULE REQUESTED'}
                    {app.site_visit_status === 'confirmed' && ' — ✓ Confirmed'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}

export default App;