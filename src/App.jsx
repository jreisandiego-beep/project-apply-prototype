import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import emailjs from '@emailjs/browser';

// --- PROTOTYPE CONFIGURATION ---
const APPLICATION_DEADLINE = new Date('2026-12-24T23:59:59'); 
const REQUIRED_DOCS = ['Proposal', 'Budget', 'Resume']; // The 3 required documents

function App() {
  // --- AUTHENTICATION STATES ---
  const [session, setSession] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [role, setRole] = useState('applicant'); // 'applicant' or 'reviewer'

  // --- APPLICANT STATES ---
  const [appData, setAppData] = useState(null); // Holds their application row from database
  const [uploadedDocs, setUploadedDocs] = useState({}); // e.g. { Proposal: 'url', Budget: 'url' }
  const isPastDeadline = new Date() > APPLICATION_DEADLINE;

  // --- REVIEWER STATES ---
  const [pendingApps, setPendingApps] = useState([]);
  const [reviewerCommentFiles, setReviewerCommentFiles] = useState({}); // Tracks comment PDFs by App ID

  // 1. CHECK LOGIN STATUS ON LOAD
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkUserRoleAndData(session.user.id);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkUserRoleAndData(session.user.id);
    });
  }, []);

  // 2. FETCH USER DATA AFTER LOGIN
  const checkUserRoleAndData = async (userId) => {
    // Check if they are a reviewer
    const { data: userData } = await supabase.from('users').select('role').eq('id', userId).single();
    if (userData && userData.role === 'reviewer') {
      setRole('reviewer');
      fetchPendingApps();
    } else {
      setRole('applicant');
      // Fetch their application if it exists
      const { data: application } = await supabase.from('applications').select('*').eq('applicant_id', userId).single();
      if (application) {
        setAppData(application);
        setUploadedDocs(application.document_urls || {});
      }
    }
  };

  const fetchPendingApps = async () => {
    const { data } = await supabase.from('applications').select('*, users(email)').eq('status', 'pending');
    if (data) setPendingApps(data);
  };

  // --- AUTH FUNCTIONS ---
  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email: emailInput, password: passwordInput });
    if (error) alert(error.message);
    else alert("Signup successful! You are now logged in.");
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: emailInput, password: passwordInput });
    if (error) alert(error.message);
  };

  // --- APPLICANT: UPLOAD SPECIFIC REQUIRED DOCUMENT ---
  const handleDocUpload = async (docType, file) => {
    if (!file) return;
    alert(`Uploading ${docType}...`);
    
    const filePath = `${session.user.id}/${docType}_${file.name}`;
    const { error } = await supabase.storage.from('documents').upload(filePath, file, { upsert: true });
    
    if (!error) {
      const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
      const newDocs = { ...uploadedDocs, [docType]: data.publicUrl };
      setUploadedDocs(newDocs);
      
      // Save draft to database immediately
      if (appData) {
        await supabase.from('applications').update({ document_urls: newDocs }).eq('id', appData.id);
      } else {
        const { data: newApp } = await supabase.from('applications').insert([{ 
          applicant_id: session.user.id, 
          status: 'draft', 
          document_urls: newDocs,
          applicant_email: session.user.email
        }]).select().single();
        setAppData(newApp);
      }
      alert(`${docType} uploaded and saved as draft!`);
    }
  };

  const handleDocDelete = async (docType) => {
    const newDocs = { ...uploadedDocs };
    delete newDocs[docType];
    setUploadedDocs(newDocs);
    await supabase.from('applications').update({ document_urls: newDocs }).eq('id', appData.id);
  };

  // --- APPLICANT: FINAL SUBMIT ---
  const handleFinalSubmit = async () => {
    await supabase.from('applications').update({ status: 'pending' }).eq('id', appData.id);
    setAppData({ ...appData, status: 'pending' });
    alert("Documents complete. Application submitted for review!");
  };

  // --- REVIEWER: DECISION WITH REQUIRED PDF ---
  const handleDecision = async (appId, applicantEmail, decision) => {
    const commentFile = reviewerCommentFiles[appId];
    
    if (!commentFile) {
      alert("STOP: You must upload a reviewer comment PDF before making a decision.");
      return;
    }

    alert("Uploading reviewer feedback and saving decision...");
    const { data: uploadData } = await supabase.storage.from('documents').upload(`reviews/${appId}/${commentFile.name}`, commentFile);
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(`reviews/${appId}/${commentFile.name}`);
    
    await supabase.from('applications').update({ 
      status: decision, 
      reviewer_comments_url: urlData.publicUrl 
    }).eq('id', appId);

    emailjs.send(
      'YOUR_SERVICE_ID', 
      'YOUR_TEMPLATE_ID', 
      { status: decision, to_email: applicantEmail }, 
      'YOUR_PUBLIC_KEY'
    ).then(() => {
      alert(`Decision recorded. Applicant notified at ${applicantEmail}.`);
      fetchPendingApps(); 
    });
  };

  // --- REVIEWER: BROADCAST OPEN/CLOSE STATUS ---
  const handleBroadcast = (isOpen) => {
    const statusMsg = isOpen ? "OPEN for submissions!" : "CLOSED.";
    alert(`Simulating Email Blast to all users: "The application period is now ${statusMsg}"`);
    // In a production app, this would trigger an Edge Function to email all users.
  };

  // ==========================================
  // USER INTERFACE
  // ==========================================

  // 1. LOGIN SCREEN (If not logged in)
  if (!session) {
    return (
      <div style={{ padding: "50px", maxWidth: "400px", margin: "0 auto", fontFamily: "sans-serif" }}>
        <h2>System Login</h2>
        <input type="email" placeholder="Email" value={emailInput} onChange={e => setEmailInput(e.target.value)} style={{ width: "100%", padding: "10px", marginBottom: "10px" }} />
        <input type="password" placeholder="Password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} style={{ width: "100%", padding: "10px", marginBottom: "10px" }} />
        <button onClick={handleLogin} style={{ width: "100%", padding: "10px", backgroundColor: "blue", color: "white", marginBottom: "10px" }}>Log In</button>
        <button onClick={handleSignUp} style={{ width: "100%", padding: "10px" }}>Create Applicant Account</button>
      </div>
    );
  }

  // 2. APPLICANT DASHBOARD
  if (role === 'applicant') {
    const status = appData?.status || 'unstarted';
    const allDocsUploaded = REQUIRED_DOCS.every(doc => uploadedDocs[doc]);

    return (
      <div style={{ padding: "50px", fontFamily: "sans-serif" }}>
        <button onClick={() => supabase.auth.signOut()} style={{ float: "right" }}>Log Out</button>
        <h1>Applicant Portal</h1>
        <p><strong>Deadline:</strong> {APPLICATION_DEADLINE.toLocaleString()}</p>
        
        {/* State A: Passed Deadline & Haven't Submitted */}
        {isPastDeadline && status !== 'pending' && status !== 'accepted' && status !== 'rejected' && (
          <div style={{ backgroundColor: "#ffebee", padding: "20px", color: "red" }}>
            <h3>Application Closed</h3>
            <p>The deadline has passed. You can no longer apply.</p>
          </div>
        )}

        {/* State B: Application is open and in draft mode */}
        {!isPastDeadline && (status === 'unstarted' || status === 'draft') && (
          <div style={{ border: "1px solid black", padding: "20px" }}>
            <h3>Required Documents</h3>
            <p>You must upload all {REQUIRED_DOCS.length} documents before submitting.</p>
            
            {REQUIRED_DOCS.map(doc => (
              <div key={doc} style={{ marginBottom: "15px", padding: "10px", backgroundColor: "#f5f5f5" }}>
                <strong>{doc}: </strong>
                {uploadedDocs[doc] ? (
                  <span>
                    <a href={uploadedDocs[doc]} target="_blank" rel="noreferrer" style={{ color: "green", marginRight: "10px" }}>✓ Uploaded</a>
                    <button onClick={() => handleDocDelete(doc)}>Remove</button>
                  </span>
                ) : (
                  <input type="file" accept="application/pdf" onChange={(e) => handleDocUpload(doc, e.target.files[0])} />
                )}
              </div>
            ))}
            
            <hr />
            <button 
              onClick={handleFinalSubmit} 
              disabled={!allDocsUploaded}
              style={{ backgroundColor: allDocsUploaded ? "blue" : "grey", color: "white", padding: "15px", fontSize: "16px", cursor: allDocsUploaded ? "pointer" : "not-allowed" }}
            >
              {allDocsUploaded ? "Submit Final Application" : "Upload all documents to unlock submit"}
            </button>
          </div>
        )}

        {/* State C: Pending Review (Locked) */}
        {status === 'pending' && (
          <div style={{ backgroundColor: "#e3f2fd", padding: "20px" }}>
            <h3>Review Pending</h3>
            <p>Your complete application has been submitted and locked. You will receive an email once the review is complete.</p>
          </div>
        )}

        {/* State D: Reviewed (Accepted/Rejected) */}
        {(status === 'accepted' || status === 'rejected') && (
          <div style={{ backgroundColor: status === 'accepted' ? "#e8f5e9" : "#ffebee", padding: "20px" }}>
            <h2>Result: {status.toUpperCase()}</h2>
            <p>The review is complete. You can download the reviewer's feedback below.</p>
            {appData?.reviewer_comments_url && (
              <a href={appData.reviewer_comments_url} target="_blank" rel="noreferrer" style={{ fontSize: "18px", display: "inline-block", marginTop: "10px" }}>
                📥 Download Reviewer Comments (PDF)
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  // 3. REVIEWER DASHBOARD
  if (role === 'reviewer') {
    return (
      <div style={{ padding: "50px", fontFamily: "sans-serif" }}>
        <button onClick={() => supabase.auth.signOut()} style={{ float: "right" }}>Log Out</button>
        <h1>Reviewer (Admin) Portal</h1>
        
        <div style={{ marginBottom: "20px", padding: "15px", backgroundColor: "#fff3e0" }}>
          <strong>Email Announcements: </strong>
          <button onClick={() => handleBroadcast(true)} style={{ marginRight: "10px" }}>Notify All: "Open"</button>
          <button onClick={() => handleBroadcast(false)}>Notify All: "Closed"</button>
        </div>

        {pendingApps.length === 0 ? <p>No applications pending review.</p> : null}
        
        {pendingApps.map((app) => (
          <div key={app.id} style={{ border: "2px solid #424242", padding: "20px", marginBottom: "20px" }}>
            <h3>Applicant: {app.applicant_email}</h3>
            
            <div style={{ display: "flex", gap: "15px", marginBottom: "20px" }}>
              {Object.entries(app.document_urls).map(([docName, url]) => (
                <a key={docName} href={url} target="_blank" rel="noreferrer" style={{ padding: "10px", backgroundColor: "#e0e0e0", textDecoration: "none", color: "black" }}>
                  📄 View {docName}
                </a>
              ))}
            </div>
            
            <div style={{ backgroundColor: "#f5f5f5", padding: "15px", borderLeft: "4px solid orange" }}>
              <p style={{ color: "red", fontWeight: "bold", margin: "0 0 10px 0" }}>* Reviewer Feedback PDF is REQUIRED</p>
              <input 
                type="file" 
                accept="application/pdf" 
                onChange={(e) => setReviewerCommentFiles({ ...reviewerCommentFiles, [app.id]: e.target.files[0] })} 
              />
              <br /><br />
              <button onClick={() => handleDecision(app.id, app.applicant_email, 'accepted')} style={{ backgroundColor: "green", color: "white", padding: "10px", marginRight: "10px" }}>Accept Proposal</button>
              <button onClick={() => handleDecision(app.id, app.applicant_email, 'rejected')} style={{ backgroundColor: "red", color: "white", padding: "10px" }}>Reject Proposal</button>
            </div>
          </div>
        ))}
      </div>
    );
  }
}

export default App;