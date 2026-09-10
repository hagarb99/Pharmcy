"""0002 Phase 2 marketplace tables

Revision ID: 0002_phase2_marketplace
Revises: 0001_initial
Create Date: 2026-09-10 03:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0002_phase2_marketplace'
down_revision: Union[str, None] = '0001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Prescription Requests table
    op.create_table(
        'prescription_requests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('patient_id', sa.UUID(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('pending', 'active', 'ordered', 'cancelled', 'completed', name='request_status_enum'),
            nullable=False,
            server_default='pending',
        ),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lng', sa.Float(), nullable=False),
        sa.Column('location_label', sa.String(length=255), nullable=True),
        sa.Column(
            'delivery_preference',
            sa.Enum('pickup_only', 'delivery_preferred', 'any', name='delivery_preference_enum'),
            nullable=False,
            server_default='any',
        ),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_prescription_requests_patient_id'), 'prescription_requests', ['patient_id'], unique=False)
    op.create_index(op.f('ix_prescription_requests_status'), 'prescription_requests', ['status'], unique=False)
    op.create_index(op.f('ix_prescription_requests_lat'), 'prescription_requests', ['lat'], unique=False)
    op.create_index(op.f('ix_prescription_requests_lng'), 'prescription_requests', ['lng'], unique=False)

    # Drug Items table
    op.create_table(
        'drug_items',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('request_id', sa.UUID(), nullable=False),
        sa.Column('drug_name', sa.String(length=150), nullable=False),
        sa.Column('dosage', sa.String(length=80), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['request_id'], ['prescription_requests.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_drug_items_request_id'), 'drug_items', ['request_id'], unique=False)

    # Pharmacy Quotes table
    op.create_table(
        'pharmacy_quotes',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('request_id', sa.UUID(), nullable=False),
        sa.Column('pharmacy_id', sa.UUID(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('submitted', 'accepted', 'rejected', 'expired', name='quote_status_enum'),
            nullable=False,
            server_default='submitted',
        ),
        sa.Column('delivery_available', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('delivery_fee', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('total_price', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['pharmacy_id'], ['pharmacies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['request_id'], ['prescription_requests.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('request_id', 'pharmacy_id', name='uq_request_pharmacy_quote'),
    )
    op.create_index(op.f('ix_pharmacy_quotes_pharmacy_id'), 'pharmacy_quotes', ['pharmacy_id'], unique=False)
    op.create_index(op.f('ix_pharmacy_quotes_request_id'), 'pharmacy_quotes', ['request_id'], unique=False)
    op.create_index(op.f('ix_pharmacy_quotes_status'), 'pharmacy_quotes', ['status'], unique=False)

    # Quote Items table
    op.create_table(
        'quote_items',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('quote_id', sa.UUID(), nullable=False),
        sa.Column('drug_item_id', sa.UUID(), nullable=False),
        sa.Column('is_available', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('price', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('substitute_name', sa.String(length=150), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['drug_item_id'], ['drug_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['quote_id'], ['pharmacy_quotes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_quote_items_drug_item_id'), 'quote_items', ['drug_item_id'], unique=False)
    op.create_index(op.f('ix_quote_items_quote_id'), 'quote_items', ['quote_id'], unique=False)

    # Orders table
    op.create_table(
        'orders',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('request_id', sa.UUID(), nullable=False),
        sa.Column('quote_id', sa.UUID(), nullable=False),
        sa.Column('patient_id', sa.UUID(), nullable=False),
        sa.Column('pharmacy_id', sa.UUID(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('confirmed', 'in_preparation', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled', name='order_status_enum'),
            nullable=False,
            server_default='confirmed',
        ),
        sa.Column(
            'delivery_option',
            sa.Enum('pickup', 'delivery', name='delivery_option_enum'),
            nullable=False,
            server_default='pickup',
        ),
        sa.Column('items_total', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('delivery_fee', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('total_amount', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('patient_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['pharmacy_id'], ['pharmacies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['quote_id'], ['pharmacy_quotes.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['request_id'], ['prescription_requests.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('quote_id'),
        sa.UniqueConstraint('request_id'),
    )
    op.create_index(op.f('ix_orders_patient_id'), 'orders', ['patient_id'], unique=False)
    op.create_index(op.f('ix_orders_pharmacy_id'), 'orders', ['pharmacy_id'], unique=False)
    op.create_index(op.f('ix_orders_quote_id'), 'orders', ['quote_id'], unique=True)
    op.create_index(op.f('ix_orders_request_id'), 'orders', ['request_id'], unique=True)
    op.create_index(op.f('ix_orders_status'), 'orders', ['status'], unique=False)


def downgrade() -> None:
    op.drop_table('orders')
    op.drop_table('quote_items')
    op.drop_table('pharmacy_quotes')
    op.drop_table('drug_items')
    op.drop_table('prescription_requests')
    op.execute("DROP TYPE IF EXISTS delivery_option_enum")
    op.execute("DROP TYPE IF EXISTS order_status_enum")
    op.execute("DROP TYPE IF EXISTS quote_status_enum")
    op.execute("DROP TYPE IF EXISTS delivery_preference_enum")
    op.execute("DROP TYPE IF EXISTS request_status_enum")
