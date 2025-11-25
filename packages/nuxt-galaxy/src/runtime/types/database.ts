export type Json
  = | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
  galaxy: {
    Tables: {
      analyses: {
        Row: {
          created_at: string
          datamap: Json
          galaxy_id: string
          history_id: number
          id: number
          invocation: Json
          is_sync: boolean
          name: string
          owner_id: string
          parameters: Json
          state: Database['galaxy']['Enums']['invocation_state']
          stderr: string | null
          stdout: string | null
          workflow_id: number
        }
        Insert: {
          created_at?: string
          datamap: Json
          galaxy_id: string
          history_id: number
          id?: number
          invocation: Json
          is_sync?: boolean
          name: string
          owner_id: string
          parameters: Json
          state: Database['galaxy']['Enums']['invocation_state']
          stderr?: string | null
          stdout?: string | null
          workflow_id: number
        }
        Update: {
          created_at?: string
          datamap?: Json
          galaxy_id?: string
          history_id?: number
          id?: number
          invocation?: Json
          is_sync?: boolean
          name?: string
          owner_id?: string
          parameters?: Json
          state?: Database['galaxy']['Enums']['invocation_state']
          stderr?: string | null
          stdout?: string | null
          workflow_id?: number
        }
        Relationships: [
          {
            foreignKeyName: 'analyses_history_id_histories_id_fk'
            columns: ['history_id']
            isOneToOne: true
            referencedRelation: 'histories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analyses_workflow_id_workflows_id_fk'
            columns: ['workflow_id']
            isOneToOne: false
            referencedRelation: 'workflows'
            referencedColumns: ['id']
          },
        ]
      }
      analysis_inputs: {
        Row: {
          analysis_id: number
          dataset_id: number
          id: number
          state: Database['galaxy']['Enums']['dataset_state']
        }
        Insert: {
          analysis_id: number
          dataset_id: number
          id?: number
          state: Database['galaxy']['Enums']['dataset_state']
        }
        Update: {
          analysis_id?: number
          dataset_id?: number
          id?: number
          state?: Database['galaxy']['Enums']['dataset_state']
        }
        Relationships: [
          {
            foreignKeyName: 'analysis_inputs_analysis_id_analyses_id_fk'
            columns: ['analysis_id']
            isOneToOne: false
            referencedRelation: 'analyses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_inputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: true
            referencedRelation: 'analysis_inputs_with_storage_path'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_inputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: true
            referencedRelation: 'analysis_outputs_with_storage_path'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_inputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: true
            referencedRelation: 'datasets'
            referencedColumns: ['id']
          },
        ]
      }
      analysis_outputs: {
        Row: {
          analysis_id: number
          dataset_id: number
          id: number
          job_id: number
          state: Database['galaxy']['Enums']['dataset_state']
        }
        Insert: {
          analysis_id: number
          dataset_id: number
          id?: number
          job_id: number
          state: Database['galaxy']['Enums']['dataset_state']
        }
        Update: {
          analysis_id?: number
          dataset_id?: number
          id?: number
          job_id?: number
          state?: Database['galaxy']['Enums']['dataset_state']
        }
        Relationships: [
          {
            foreignKeyName: 'analysis_outputs_analysis_id_analyses_id_fk'
            columns: ['analysis_id']
            isOneToOne: false
            referencedRelation: 'analyses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_outputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: false
            referencedRelation: 'analysis_inputs_with_storage_path'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_outputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: false
            referencedRelation: 'analysis_outputs_with_storage_path'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_outputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: false
            referencedRelation: 'datasets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_outputs_job_id_jobs_id_fk'
            columns: ['job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['id']
          },
        ]
      }
      analysis_outputs_to_tags: {
        Row: {
          analysis_output_id: number
          tag_id: number
        }
        Insert: {
          analysis_output_id: number
          tag_id: number
        }
        Update: {
          analysis_output_id?: number
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: 'analysis_outputs_to_tags_analysis_output_id_analysis_outputs_id'
            columns: ['analysis_output_id']
            isOneToOne: false
            referencedRelation: 'analysis_outputs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_outputs_to_tags_tag_id_tags_id_fk'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'tags'
            referencedColumns: ['id']
          },
        ]
      }
      datasets: {
        Row: {
          annotation: string | null
          created_at: string
          data_lines: number | null
          dataset_name: string
          extension: string
          galaxy_id: string
          history_id: number
          id: number
          misc_blurb: string | null
          owner_id: string
          storage_object_id: string
          uuid: string
        }
        Insert: {
          annotation?: string | null
          created_at?: string
          data_lines?: number | null
          dataset_name: string
          extension: string
          galaxy_id: string
          history_id: number
          id?: number
          misc_blurb?: string | null
          owner_id: string
          storage_object_id: string
          uuid: string
        }
        Update: {
          annotation?: string | null
          created_at?: string
          data_lines?: number | null
          dataset_name?: string
          extension?: string
          galaxy_id?: string
          history_id?: number
          id?: number
          misc_blurb?: string | null
          owner_id?: string
          storage_object_id?: string
          uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: 'datasets_history_id_histories_id_fk'
            columns: ['history_id']
            isOneToOne: false
            referencedRelation: 'histories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'datasets_storage_object_id_objects_id_fk'
            columns: ['storage_object_id']
            isOneToOne: false
            referencedRelation: 'datasets_with_storage_path'
            referencedColumns: ['id']
          },
        ]
      }
      datasets_to_tags: {
        Row: {
          dataset_id: number
          tag_id: number
        }
        Insert: {
          dataset_id: number
          tag_id: number
        }
        Update: {
          dataset_id?: number
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: 'datasets_to_tags_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: false
            referencedRelation: 'analysis_inputs_with_storage_path'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'datasets_to_tags_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: false
            referencedRelation: 'analysis_outputs_with_storage_path'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'datasets_to_tags_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: false
            referencedRelation: 'datasets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'datasets_to_tags_tag_id_tags_id_fk'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'tags'
            referencedColumns: ['id']
          },
        ]
      }
      histories: {
        Row: {
          annotation: string | null
          created_at: string
          galaxy_id: string
          id: number
          is_deleted: boolean
          is_sync: boolean
          name: string
          owner_id: string
          state: Database['galaxy']['Enums']['history_state']
          user_id: number
        }
        Insert: {
          annotation?: string | null
          created_at?: string
          galaxy_id: string
          id?: number
          is_deleted?: boolean
          is_sync?: boolean
          name: string
          owner_id: string
          state: Database['galaxy']['Enums']['history_state']
          user_id: number
        }
        Update: {
          annotation?: string | null
          created_at?: string
          galaxy_id?: string
          id?: number
          is_deleted?: boolean
          is_sync?: boolean
          name?: string
          owner_id?: string
          state?: Database['galaxy']['Enums']['history_state']
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: 'histories_user_id_user_id_fk'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user'
            referencedColumns: ['id']
          },
        ]
      }
      instances: {
        Row: {
          id: number
          name: string
          url: string
        }
        Insert: {
          id?: number
          name: string
          url: string
        }
        Update: {
          id?: number
          name?: string
          url?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          analysis_id: number
          created_at: string
          exit_code: number | null
          galaxy_id: string
          id: number
          is_sync: boolean
          owner_id: string
          state: Database['galaxy']['Enums']['job_state']
          stderr: string | null
          stdout: string | null
          step_id: number
          tool_id: string
        }
        Insert: {
          analysis_id: number
          created_at?: string
          exit_code?: number | null
          galaxy_id: string
          id?: number
          is_sync?: boolean
          owner_id: string
          state: Database['galaxy']['Enums']['job_state']
          stderr?: string | null
          stdout?: string | null
          step_id: number
          tool_id: string
        }
        Update: {
          analysis_id?: number
          created_at?: string
          exit_code?: number | null
          galaxy_id?: string
          id?: number
          is_sync?: boolean
          owner_id?: string
          state?: Database['galaxy']['Enums']['job_state']
          stderr?: string | null
          stdout?: string | null
          step_id?: number
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'jobs_analysis_id_analyses_id_fk'
            columns: ['analysis_id']
            isOneToOne: false
            referencedRelation: 'analyses'
            referencedColumns: ['id']
          },
        ]
      }
      role_permissions: {
        Row: {
          id: number
          permission: Database['galaxy']['Enums']['role_permissions_type']
          role_id: number
        }
        Insert: {
          id?: number
          permission: Database['galaxy']['Enums']['role_permissions_type']
          role_id: number
        }
        Update: {
          id?: number
          permission?: Database['galaxy']['Enums']['role_permissions_type']
          role_id?: number
        }
        Relationships: [
          {
            foreignKeyName: 'role_permissions_role_id_roles_id_fk'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
        ]
      }
      roles: {
        Row: {
          id: number
          name: Database['galaxy']['Enums']['role_type']
        }
        Insert: {
          id?: number
          name: Database['galaxy']['Enums']['role_type']
        }
        Update: {
          id?: number
          name?: Database['galaxy']['Enums']['role_type']
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: number
          label: string
        }
        Insert: {
          id?: number
          label: string
        }
        Update: {
          id?: number
          label?: string
        }
        Relationships: []
      }
      uploaded_datasets: {
        Row: {
          dataset_name: string
          id: number
          owner_id: string
          storage_object_id: string
        }
        Insert: {
          dataset_name: string
          id?: number
          owner_id: string
          storage_object_id: string
        }
        Update: {
          dataset_name?: string
          id?: number
          owner_id?: string
          storage_object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'uploaded_datasets_storage_object_id_objects_id_fk'
            columns: ['storage_object_id']
            isOneToOne: true
            referencedRelation: 'datasets_with_storage_path'
            referencedColumns: ['id']
          },
        ]
      }
      user: {
        Row: {
          email: string
          id: number
          instance_id: number
        }
        Insert: {
          email: string
          id?: number
          instance_id: number
        }
        Update: {
          email?: string
          id?: number
          instance_id?: number
        }
        Relationships: [
          {
            foreignKeyName: 'user_instance_id_instances_id_fk'
            columns: ['instance_id']
            isOneToOne: false
            referencedRelation: 'instances'
            referencedColumns: ['id']
          },
        ]
      }
      user_roles: {
        Row: {
          id: number
          role_id: number
          user_id: string
        }
        Insert: {
          id?: number
          role_id: number
          user_id: string
        }
        Update: {
          id?: number
          role_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_roles_role_id_roles_id_fk'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
        ]
      }
      workflows: {
        Row: {
          annotation: string | null
          auto_version: number
          definition: Json
          galaxy_id: string
          id: number
          name: string
          name_key: string
          user_id: number
          version_key: string
        }
        Insert: {
          annotation?: string | null
          auto_version?: number
          definition: Json
          galaxy_id: string
          id?: number
          name: string
          name_key: string
          user_id: number
          version_key: string
        }
        Update: {
          annotation?: string | null
          auto_version?: number
          definition?: Json
          galaxy_id?: string
          id?: number
          name?: string
          name_key?: string
          user_id?: number
          version_key?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workflows_user_id_user_id_fk'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user'
            referencedColumns: ['id']
          },
        ]
      }
      workflows_to_tags: {
        Row: {
          tag_id: number
          workflow_id: number
        }
        Insert: {
          tag_id: number
          workflow_id: number
        }
        Update: {
          tag_id?: number
          workflow_id?: number
        }
        Relationships: [
          {
            foreignKeyName: 'workflows_to_tags_tag_id_tags_id_fk'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'tags'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'workflows_to_tags_workflow_id_workflows_id_fk'
            columns: ['workflow_id']
            isOneToOne: false
            referencedRelation: 'workflows'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      analysis_inputs_with_storage_path: {
        Row: {
          analysis_id: number | null
          annotation: string | null
          created_at: string | null
          data_lines: number | null
          dataset_id: number | null
          dataset_name: string | null
          extension: string | null
          galaxy_id: string | null
          history_id: number | null
          id: number | null
          metadata: Json | null
          misc_blurb: string | null
          name: string | null
          owner_id: string | null
          state: Database['galaxy']['Enums']['dataset_state'] | null
          storage_object_id: string | null
          uuid: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'analysis_inputs_analysis_id_analyses_id_fk'
            columns: ['analysis_id']
            isOneToOne: false
            referencedRelation: 'analyses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_inputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: true
            referencedRelation: 'analysis_inputs_with_storage_path'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_inputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: true
            referencedRelation: 'analysis_outputs_with_storage_path'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_inputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: true
            referencedRelation: 'datasets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'datasets_history_id_histories_id_fk'
            columns: ['history_id']
            isOneToOne: false
            referencedRelation: 'histories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'datasets_storage_object_id_objects_id_fk'
            columns: ['storage_object_id']
            isOneToOne: false
            referencedRelation: 'datasets_with_storage_path'
            referencedColumns: ['id']
          },
        ]
      }
      analysis_outputs_with_storage_path: {
        Row: {
          analysis_id: number | null
          annotation: string | null
          created_at: string | null
          data_lines: number | null
          dataset_id: number | null
          dataset_name: string | null
          extension: string | null
          galaxy_id: string | null
          history_id: number | null
          id: number | null
          job_id: number | null
          metadata: Json | null
          misc_blurb: string | null
          name: string | null
          owner_id: string | null
          state: Database['galaxy']['Enums']['dataset_state'] | null
          storage_object_id: string | null
          uuid: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'analysis_outputs_analysis_id_analyses_id_fk'
            columns: ['analysis_id']
            isOneToOne: false
            referencedRelation: 'analyses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_outputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: false
            referencedRelation: 'analysis_inputs_with_storage_path'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_outputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: false
            referencedRelation: 'analysis_outputs_with_storage_path'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_outputs_dataset_id_datasets_id_fk'
            columns: ['dataset_id']
            isOneToOne: false
            referencedRelation: 'datasets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'analysis_outputs_job_id_jobs_id_fk'
            columns: ['job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'datasets_history_id_histories_id_fk'
            columns: ['history_id']
            isOneToOne: false
            referencedRelation: 'histories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'datasets_storage_object_id_objects_id_fk'
            columns: ['storage_object_id']
            isOneToOne: false
            referencedRelation: 'datasets_with_storage_path'
            referencedColumns: ['id']
          },
        ]
      }
      datasets_with_storage_path: {
        Row: {
          annotation: string | null
          created_at: string | null
          data_lines: number | null
          dataset_name: string | null
          extension: string | null
          galaxy_id: string | null
          history_id: number | null
          id: string | null
          metadata: Json | null
          misc_blurb: string | null
          name: string | null
          owner_id: string | null
          storage_object_id: string | null
          uuid: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'datasets_history_id_histories_id_fk'
            columns: ['history_id']
            isOneToOne: false
            referencedRelation: 'histories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'datasets_storage_object_id_objects_id_fk'
            columns: ['storage_object_id']
            isOneToOne: false
            referencedRelation: 'datasets_with_storage_path'
            referencedColumns: ['id']
          },
        ]
      }
      uploaded_datasets_with_storage_path: {
        Row: {
          dataset_name: string | null
          id: number | null
          metadata: Json | null
          owner_id: string | null
          storage_object_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'uploaded_datasets_storage_object_id_objects_id_fk'
            columns: ['storage_object_id']
            isOneToOne: true
            referencedRelation: 'datasets_with_storage_path'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      authorize: {
        Args: {
          requested_permission: Database['galaxy']['Enums']['role_permissions_type']
        }
        Returns: boolean
      }
      custom_access_token_hook: { Args: { event: Json }, Returns: Json }
    }
    Enums: {
      dataset_state:
        | 'ok'
        | 'empty'
        | 'error'
        | 'discarded'
        | 'failed_metadata'
        | 'new'
        | 'upload'
        | 'queued'
        | 'running'
        | 'paused'
        | 'setting_metadata'
        | 'deferred'
      history_state:
        | 'new'
        | 'upload'
        | 'queued'
        | 'running'
        | 'ok'
        | 'empty'
        | 'error'
        | 'paused'
        | 'setting_metadata'
        | 'failed_metadata'
        | 'deferred'
        | 'discarded'
      invocation_state:
        | 'cancelled'
        | 'failed'
        | 'scheduled'
        | 'new'
        | 'ready'
        | 'cancelling'
      job_state:
        | 'deleted'
        | 'deleting'
        | 'error'
        | 'ok'
        | 'new'
        | 'resubmitted'
        | 'upload'
        | 'waiting'
        | 'queued'
        | 'running'
        | 'failed'
        | 'paused'
        | 'stop'
        | 'stopped'
        | 'skipped'
      role_permissions_type:
        | 'workflows.insert'
        | 'workflows.update'
        | 'workflows.select'
        | 'workflows.delete'
        | 'instances.insert'
        | 'instances.delete'
        | 'instances.update'
        | 'instances.select'
        | 'user.select'
        | 'user.insert'
        | 'user.update'
        | 'user.delete'
        | 'roles.select'
        | 'roles.insert'
        | 'roles.update'
        | 'roles.delete'
        | 'role_permissions.select'
        | 'role_permissions.insert'
        | 'role_permissions.update'
        | 'role_permissions.delete'
        | 'tags.select'
        | 'tags.insert'
        | 'tags.update'
        | 'tags.delete'
        | 'user_roles.select'
        | 'user_roles.insert'
        | 'user_roles.update'
        | 'user_roles.delete'
      role_type: 'admin' | 'user'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database['storage']['Enums']['buckettype']
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database['storage']['Enums']['buckettype']
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database['storage']['Enums']['buckettype']
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          format: string
          id: string
          type: Database['storage']['Enums']['buckettype']
          updated_at: string
        }
        Insert: {
          created_at?: string
          format?: string
          id: string
          type?: Database['storage']['Enums']['buckettype']
          updated_at?: string
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          type?: Database['storage']['Enums']['buckettype']
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database['storage']['Enums']['buckettype']
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database['storage']['Enums']['buckettype']
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database['storage']['Enums']['buckettype']
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'iceberg_namespaces_bucket_id_fkey'
            columns: ['bucket_id']
            isOneToOne: false
            referencedRelation: 'buckets_analytics'
            referencedColumns: ['id']
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'iceberg_tables_bucket_id_fkey'
            columns: ['bucket_id']
            isOneToOne: false
            referencedRelation: 'buckets_analytics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'iceberg_tables_namespace_id_fkey'
            columns: ['namespace_id']
            isOneToOne: false
            referencedRelation: 'iceberg_namespaces'
            referencedColumns: ['id']
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          level: number | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'objects_bucketId_fkey'
            columns: ['bucket_id']
            isOneToOne: false
            referencedRelation: 'buckets'
            referencedColumns: ['id']
          },
        ]
      }
      prefixes: {
        Row: {
          bucket_id: string
          created_at: string | null
          level: number
          name: string
          updated_at: string | null
        }
        Insert: {
          bucket_id: string
          created_at?: string | null
          level?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          bucket_id?: string
          created_at?: string | null
          level?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'prefixes_bucketId_fkey'
            columns: ['bucket_id']
            isOneToOne: false
            referencedRelation: 'buckets'
            referencedColumns: ['id']
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_bucket_id_fkey'
            columns: ['bucket_id']
            isOneToOne: false
            referencedRelation: 'buckets'
            referencedColumns: ['id']
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_parts_bucket_id_fkey'
            columns: ['bucket_id']
            isOneToOne: false
            referencedRelation: 'buckets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 's3_multipart_uploads_parts_upload_id_fkey'
            columns: ['upload_id']
            isOneToOne: false
            referencedRelation: 's3_multipart_uploads'
            referencedColumns: ['id']
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'vector_indexes_bucket_id_fkey'
            columns: ['bucket_id']
            isOneToOne: false
            referencedRelation: 'buckets_vectors'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_prefixes: {
        Args: { _bucket_id: string, _name: string }
        Returns: undefined
      }
      can_insert_object: {
        Args: { bucketid: string, metadata: Json, name: string, owner: string }
        Returns: undefined
      }
      delete_leaf_prefixes: {
        Args: { bucket_ids: string[], names: string[] }
        Returns: undefined
      }
      delete_prefix: {
        Args: { _bucket_id: string, _name: string }
        Returns: boolean
      }
      extension: { Args: { name: string }, Returns: string }
      filename: { Args: { name: string }, Returns: string }
      foldername: { Args: { name: string }, Returns: string[] }
      get_level: { Args: { name: string }, Returns: number }
      get_prefix: { Args: { name: string }, Returns: string }
      get_prefixes: { Args: { name: string }, Returns: string[] }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          start_after?: string
        }
        Returns: {
          id: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      lock_top_prefixes: {
        Args: { bucket_ids: string[], names: string[] }
        Returns: undefined
      }
      operation: { Args: never, Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_legacy_v1: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v1_optimised: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: 'STANDARD' | 'ANALYTICS' | 'VECTOR'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
      & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
      ? R
      : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables']
    & DefaultSchema['Views'])
    ? (DefaultSchema['Tables']
      & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
        ? R
        : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema['Tables']
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
    Insert: infer I
  }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema['Tables']
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
    Update: infer U
  }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema['Enums']
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema['CompositeTypes']
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  galaxy: {
    Enums: {
      dataset_state: [
        'ok',
        'empty',
        'error',
        'discarded',
        'failed_metadata',
        'new',
        'upload',
        'queued',
        'running',
        'paused',
        'setting_metadata',
        'deferred',
      ],
      history_state: [
        'new',
        'upload',
        'queued',
        'running',
        'ok',
        'empty',
        'error',
        'paused',
        'setting_metadata',
        'failed_metadata',
        'deferred',
        'discarded',
      ],
      invocation_state: [
        'cancelled',
        'failed',
        'scheduled',
        'new',
        'ready',
        'cancelling',
      ],
      job_state: [
        'deleted',
        'deleting',
        'error',
        'ok',
        'new',
        'resubmitted',
        'upload',
        'waiting',
        'queued',
        'running',
        'failed',
        'paused',
        'stop',
        'stopped',
        'skipped',
      ],
      role_permissions_type: [
        'workflows.insert',
        'workflows.update',
        'workflows.select',
        'workflows.delete',
        'instances.insert',
        'instances.delete',
        'instances.update',
        'instances.select',
        'user.select',
        'user.insert',
        'user.update',
        'user.delete',
        'roles.select',
        'roles.insert',
        'roles.update',
        'roles.delete',
        'role_permissions.select',
        'role_permissions.insert',
        'role_permissions.update',
        'role_permissions.delete',
        'tags.select',
        'tags.insert',
        'tags.update',
        'tags.delete',
        'user_roles.select',
        'user_roles.insert',
        'user_roles.update',
        'user_roles.delete',
      ],
      role_type: ['admin', 'user'],
    },
  },
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ['STANDARD', 'ANALYTICS', 'VECTOR'],
    },
  },
} as const
