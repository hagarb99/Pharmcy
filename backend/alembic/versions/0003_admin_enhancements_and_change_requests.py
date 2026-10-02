"""0003 Admin enhancements and pharmacy change requests

Revision ID: 0003_admin_change_requests
Revises: 0002_phase2_marketplace
Create Date: 2026-09-10 22:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '0003_admin_change_requests'
down_revision: Union[str, None] = '0002_phase2_marketplace'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add prescription_image_filename to prescription_requests table
    op.add_column(
        'prescription_requests',
        sa.Column('prescription_image_filename', sa.String(length=255), nullable=True),
    )

    from sqlalchemy.dialects import postgresql

    # 2. Create change_request_status_enum if not exists
    change_request_status_enum = postgresql.ENUM(
        'pending', 'approved', 'rejected', name='change_request_status_enum'
    )
    change_request_status_enum.create(op.get_bind(), checkfirst=True)

    # 3. Create pharmacy_change_requests table
    op.create_table(
        'pharmacy_change_requests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('pharmacy_id', sa.UUID(), nullable=False),
        sa.Column('field_name', sa.String(length=50), nullable=False),
        sa.Column('old_value', sa.Text(), nullable=False),
        sa.Column('new_value', sa.Text(), nullable=False),
        sa.Column(
            'status',
            postgresql.ENUM(
                'pending',
                'approved',
                'rejected',
                name='change_request_status_enum',
                create_type=False,
            ),
            nullable=False,
            server_default='pending',
        ),
        sa.Column('admin_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewed_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['pharmacy_id'], ['pharmacies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reviewed_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_pharmacy_change_requests_pharmacy_id'),
        'pharmacy_change_requests',
        ['pharmacy_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_pharmacy_change_requests_status'),
        'pharmacy_change_requests',
        ['status'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f('ix_pharmacy_change_requests_status'), table_name='pharmacy_change_requests'
    )
    op.drop_index(
        op.f('ix_pharmacy_change_requests_pharmacy_id'), table_name='pharmacy_change_requests'
    )
    op.drop_table('pharmacy_change_requests')

    sa.Enum(name='change_request_status_enum').drop(op.get_bind(), checkfirst=True)

    op.drop_column('prescription_requests', 'prescription_image_filename')
