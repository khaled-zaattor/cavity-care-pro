-- Create enum for tooth association type
CREATE TYPE tooth_association_type AS ENUM (
  'not_related',
  'single_tooth',
  'multiple_teeth'
);

-- Add tooth_association column to sub_treatments table
ALTER TABLE sub_treatments
ADD COLUMN tooth_association tooth_association_type DEFAULT 'not_related' NOT NULL;