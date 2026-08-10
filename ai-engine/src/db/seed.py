"""
EIF: Database Seeder Script
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 05_DATABASE_SCHEMA.md
---
Populates the database with realistic demo data for immediate full-stack demonstration.

Usage:
  python -m src.db.seed
"""

from datetime import datetime

from sqlmodel import Session, select

from src.db.database import create_db_and_tables, engine
from src.db.models import (
    Candidate,
    Company,
    Evidence,
    ExplainabilityReport,
    JobApplication,
    JobPosting,
    Requirement,
    UserAccount,
)
from src.security.jwt import hash_password


def seed_database():
    """Seeds sample companies, users, candidates, jobs, applications, and evidences."""
    print("[INIT] Initializing database schema...")
    create_db_and_tables()

    with Session(engine) as session:
        # Check if already seeded
        existing_company = session.exec(select(Company)).first()
        if existing_company:
            print("[INFO] Database already contains data. Skipping seeder.")
            return

        print("[SEED] Seeding Companies...")
        acme = Company(name="Acme Corp", industry="Enterprise Software")
        techwave = Company(name="TechWave AI", industry="Artificial Intelligence")
        session.add(acme)
        session.add(techwave)
        session.commit()
        session.refresh(acme)
        session.refresh(techwave)

        print("[SEED] Seeding User Accounts & Candidates...")
        # Employer user
        emp_user = UserAccount(
            email="employer@acme.com",
            hashed_password=hash_password("employer123"),
            role="employer",
            company_name="Acme Corp",
            tax_number="1234567890",  # checksum-valid VKN
            company_size="21-50",
            company_email="ik@acme.com",
        )
        session.add(emp_user)

        # Candidate 1: Alice Chen
        cand1_user = UserAccount(
            email="alice@chen.dev",
            hashed_password=hash_password("candidate123"),
            role="candidate"
        )
        session.add(cand1_user)
        session.commit()

        alice = Candidate(
            external_id="cand_alice_chen",
            # Ownership, exactly as registration records it: /auth/me hands
            # this profile to the account, and evidence is only accepted for a
            # profile the caller owns.
            user_id=cand1_user.id,
            name="Alice Chen",
            consent_granted=True,
            created_at=datetime.utcnow()
        )
        bob = Candidate(
            external_id="cand_bob_smith",
            name="Bob Smith",
            consent_granted=True,
            created_at=datetime.utcnow()
        )
        session.add(alice)
        session.add(bob)
        session.commit()

        print("[SEED] Seeding Requirements...")
        req1 = Requirement(
            external_id="req_react_state",
            description="Must demonstrate advanced React Context state management in production code."
        )
        req2 = Requirement(
            external_id="req_python_fastapi",
            description="Must have proven experience designing asynchronous REST APIs with FastAPI and Pydantic."
        )
        req3 = Requirement(
            external_id="req_cicd_pipeline",
            description="Must have designed and deployed automated GitHub Actions CI/CD workflows."
        )
        session.add(req1)
        session.add(req2)
        session.add(req3)
        session.commit()

        print("[SEED] Seeding Job Postings...")
        # Demo data spans sectors on purpose: a platform that claims to serve
        # every profession should not open with two software listings.
        job1 = JobPosting(
            company_id=acme.id,
            title="Kıdemli Frontend Geliştirici",
            description="Modern React, durum yönetimi ve mikro-frontend mimarisinde deneyimli bir geliştirici arıyoruz.",
            category="TECHNOLOGY",
            status="active",
        )
        job2 = JobPosting(
            company_id=techwave.id,
            title="Yoğun Bakım Hemşiresi",
            description="Yoğun bakım ünitesinde en az 2 yıl deneyimli, sertifikalı hemşire aranıyor. Vardiyalı çalışma.",
            category="HEALTHCARE",
            status="active",
        )
        job3 = JobPosting(
            company_id=acme.id,
            title="Ağır Vasıta Şoförü (SRC Belgeli)",
            description="Yurt içi lojistik operasyonlarında görev alacak, E sınıfı ehliyet ve SRC belgesine sahip şoför.",
            category="TRANSPORTATION",
            status="active",
        )
        job4 = JobPosting(
            company_id=techwave.id,
            title="Restoran Şefi",
            description="Menü planlama, maliyet kontrolü ve mutfak ekibi yönetimi konularında deneyimli şef.",
            category="GASTRONOMY",
            status="active",
        )
        job5 = JobPosting(
            company_id=acme.id,
            title="Şantiye Şefi",
            description="Konut projelerinde saha yönetimi, İSG mevzuatına hakim, inşaat mühendisi veya tekniker.",
            category="CONSTRUCTION",
            status="active",
        )
        job6 = JobPosting(
            company_id=techwave.id,
            title="Sınıf Öğretmeni",
            description="İlkokul kademesinde görev alacak, formasyon sahibi öğretmen.",
            category="EDUCATION",
            status="active",
        )
        # Ownership, exactly as create_job records it: accepting or declining a
        # posting's applications is reserved to the employer who posted it, so
        # demo postings with no known creator could never be decided.
        for job in (job1, job2, job3, job4, job5, job6):
            job.created_by_user_id = emp_user.id
            session.add(job)
        session.commit()

        # Every posting needs a requirement the AI can evaluate against;
        # otherwise the engine falls back to a generic "technical requirement"
        # regardless of the profession.
        for job in (job1, job2, job3, job4, job5, job6):
            session.add(
                Requirement(
                    external_id=f"req_job_{job.id}",
                    description=job.description,
                )
            )
        session.commit()

        print("[SEED] Seeding Job Applications...")
        app1 = JobApplication(
            candidate_id=alice.id,
            job_id=job1.id,
            status="reviewing"
        )
        session.add(app1)
        session.commit()

        print("[SEED] Seeding AI Evidence Extractions...")
        # source_type values match what the live app sends (jobs page): a
        # verified PORTFOLIO/PDF/CERTIFICATE surfaces as a standout tag on the
        # employer dashboard.
        e1 = Evidence(
            candidate_external_id=alice.external_id,
            requirement_external_id=req1.external_id,
            source_type="PORTFOLIO_LINK",
            status="VERIFIED",
            confidence_score=92,
            reasoning="Alice has implemented global state using React Context across multiple production repositories. Directly verified in repository alice/ecommerce-app.",
            evidence_pointer="github.com/alice/ecommerce-app/commit/9f8d7a#diff-auth-context",
        )
        e1b = Evidence(
            candidate_external_id=alice.external_id,
            requirement_external_id=req1.external_id,
            source_type="PDF_RESUME",
            status="VERIFIED",
            confidence_score=88,
            reasoning="Özgeçmiş, 6 yıl kesintisiz frontend deneyimini ve son işyerini referans bağlantısıyla doğruluyor.",
            evidence_pointer="pdf://alice-cv.pdf#page=1",
        )
        e2 = Evidence(
            candidate_external_id=alice.external_id,
            requirement_external_id=req3.external_id,
            source_type="CHATGPT_EXPORT",
            status="INSUFFICIENT EVIDENCE",
            reasoning="No GitHub Actions or CI/CD workflow files (.github/workflows) were detected in the candidate's provided code payloads.",
            evidence_pointer=None,
        )
        e3 = Evidence(
            candidate_external_id=bob.external_id,
            requirement_external_id=req2.external_id,
            source_type="PDF_RESUME",
            status="VERIFIED",
            confidence_score=90,
            reasoning="Candidate resume explicitly details building 5+ FastAPI async microservices serving 10M daily requests at previous employer.",
            evidence_pointer="pdf://resume.pdf#page=1&section=experience",
        )
        session.add(e1)
        session.add(e1b)
        session.add(e2)
        session.add(e3)
        session.commit()

        print("[SEED] Seeding Explainability Reports...")
        report1 = ExplainabilityReport(
            application_id=app1.id,
            candidate_external_id=alice.external_id,
            match_matrix='{"req_react_state": "VERIFIED", "req_cicd_pipeline": "INSUFFICIENT EVIDENCE"}',
            final_summary="Alice Chen shows strong verified expertise in React State Management. CI/CD capabilities require probing during human interview."
        )
        session.add(report1)
        session.commit()

    print("[SUCCESS] Database successfully seeded with demo data!")


if __name__ == "__main__":
    seed_database()
